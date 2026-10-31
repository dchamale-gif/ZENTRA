const pool = require('../db/connection');
const { REDONDEOS, precioSugerido } = require('../utils/precios');
const { publicarPreciosWeb } = require('./integracionesController');

// Pantalla «Precios»: margen de beneficio por empresa y por artículo, precio sugerido según
// el precio de compra y publicación del precio al punto de venta y a la página web.

const DEFAULTS = { margen_defecto: 30, redondeo: 0.01 };
const MAX_PRECIO = 99999999.99;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (!error.expose) console.error(fallback, error);
  res.status(error.status || 500).json({ error: error.expose ? error.message : fallback });
};

const leerConfig = async (db = pool) => {
  const { rows } = await db.query('SELECT margen_defecto, redondeo FROM config_precios');
  const row = rows[0] || DEFAULTS;
  return { margenDefecto: Number(row.margen_defecto), redondeo: Number(row.redondeo) };
};

// Margen válido (0 a 1000 %) o null para «usar el de la empresa».
const leerMargen = (value, { permitirVacio }) => {
  if (permitirVacio && (value === null || value === undefined || value === '')) return null;
  const margen = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(margen) || margen < 0 || margen > 1000) throw httpError(400, 'El margen debe estar entre 0 % y 1000 %');
  return margen;
};

const mapArticulo = (row, config) => {
  const margenPropio = row.margen === null ? null : Number(row.margen);
  const margen = margenPropio ?? config.margenDefecto;
  const costo = Number(row.precio_costo) || 0;
  const publicado = Number(row.precio_unitario) || 0;
  const sugerido = precioSugerido(costo, margen, config.redondeo);
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre_articulo,
    seccion: row.categoria,
    familia: row.familia,
    costo,
    margenPropio,
    margen,
    publicado,
    sugerido,
    // Margen real del precio publicado, sobre el costo.
    margenActual: costo > 0 && publicado > 0 ? Math.round(((publicado - costo) / costo) * 1000) / 10 : null,
    pendiente: sugerido !== null && Math.abs(sugerido - publicado) >= 0.005
  };
};

const listar = async (req, res) => {
  try {
    const config = await leerConfig();
    const { rows } = await pool.query(
      `SELECT id, codigo, nombre_articulo, categoria, familia, precio_costo, precio_unitario, margen
       FROM codigos_articulos WHERE COALESCE(activo, true)
       ORDER BY nombre_articulo`
    );
    const articulos = rows.map((row) => mapArticulo(row, config));
    res.json({
      success: true,
      config,
      redondeos: REDONDEOS,
      articulos,
      resumen: {
        pendientes: articulos.filter((a) => a.pendiente).length,
        sinCosto: articulos.filter((a) => a.sugerido === null).length
      }
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo los precios');
  }
};

// Solo el margen y el redondeo, para calcular el sugerido en el formulario de artículos.
const obtenerConfig = async (req, res) => {
  try {
    res.json({ success: true, config: await leerConfig() });
  } catch (error) {
    sendError(res, error, 'Error obteniendo la configuración de precios');
  }
};

const guardarConfig = async (req, res) => {
  try {
    const margen = leerMargen(req.body.margenDefecto, { permitirVacio: false });
    const redondeo = Number(req.body.redondeo);
    if (!REDONDEOS.includes(redondeo)) throw httpError(400, 'Elige un redondeo de la lista');
    await pool.query(
      `INSERT INTO config_precios (margen_defecto, redondeo, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (organization_id) DO UPDATE SET margen_defecto = EXCLUDED.margen_defecto,
         redondeo = EXCLUDED.redondeo, updated_at = NOW()`,
      [margen, redondeo]
    );
    res.json({ success: true, message: `Margen por defecto: ${margen} %`, config: await leerConfig() });
  } catch (error) {
    sendError(res, error, 'Error guardando la configuración de precios');
  }
};

/**
 * Cambia el margen propio de varios artículos: por ids, o por sección (y familia).
 * margen vacío = vuelven a usar el margen de la empresa. No publica nada.
 */
const asignarMargen = async (req, res) => {
  try {
    const margen = leerMargen(req.body.margen, { permitirVacio: true });
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 5000) : null;
    const seccion = req.body.seccion ? String(req.body.seccion) : null;
    if (!ids?.length && !seccion) throw httpError(400, 'Elige los artículos o la sección');
    const { rowCount } = ids?.length
      ? await pool.query('UPDATE codigos_articulos SET margen = $1, updated_at = NOW() WHERE id::text = ANY($2)', [margen, ids])
      : await pool.query(
        `UPDATE codigos_articulos SET margen = $1, updated_at = NOW()
         WHERE categoria = $2 AND ($3::text IS NULL OR familia = $3)`,
        [margen, seccion, req.body.familia ? String(req.body.familia) : null]
      );
    res.json({
      success: true,
      message: `${margen === null ? 'Margen de la empresa' : `Margen de ${margen} %`} en ${rowCount} artículo${rowCount === 1 ? '' : 's'}. Revisa los precios sugeridos y publícalos.`
    });
  } catch (error) {
    sendError(res, error, 'Error asignando el margen');
  }
};

/**
 * Publica precios: el sugerido o el que se indique por artículo ({ id, precio }).
 * Se actualiza el punto de venta y, si la web está conectada con columna de precio, la web.
 */
const publicar = async (req, res) => {
  let client;
  try {
    const pedidos = Array.isArray(req.body.items) ? req.body.items.slice(0, 5000) : [];
    if (!pedidos.length) throw httpError(400, 'Elige los artículos a publicar');
    const config = await leerConfig();
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, codigo, nombre_articulo, categoria, familia, precio_costo, precio_unitario, margen
       FROM codigos_articulos WHERE id::text = ANY($1) FOR UPDATE`,
      [pedidos.map((item) => String(item.id))]
    );
    const porId = new Map(rows.map((row) => [String(row.id), row]));
    const publicados = [];
    for (const pedido of pedidos) {
      const row = porId.get(String(pedido.id));
      if (!row) continue;
      const articulo = mapArticulo(row, config);
      const precio = pedido.precio === undefined || pedido.precio === null || pedido.precio === ''
        ? articulo.sugerido
        : Math.round(Number(pedido.precio) * 100) / 100;
      if (precio === null) throw httpError(400, `«${articulo.nombre}» no tiene precio de compra; escribe el precio a mano`);
      if (!Number.isFinite(precio) || precio <= 0 || precio > MAX_PRECIO) throw httpError(400, `El precio de «${articulo.nombre}» no es válido`);
      await client.query('UPDATE codigos_articulos SET precio_unitario = $1, updated_at = NOW() WHERE id = $2', [precio, row.id]);
      publicados.push({ codigo: row.codigo, precio });
    }
    await client.query('COMMIT');
    client.release();
    client = null;

    // El punto de venta ya tiene los precios; la web es aparte y su fallo no los deshace.
    let web = null;
    try {
      const resultado = await publicarPreciosWeb(publicados.filter((item) => item.codigo));
      web = resultado ? { ok: true, ...resultado } : null;
    } catch (error) {
      web = { ok: false, error: error.expose ? error.message : 'No se pudo conectar con la web' };
      if (!error.expose) console.error('Error publicando precios en la web:', error);
    }
    const n = publicados.length;
    res.json({
      success: true,
      publicados: n,
      web,
      message: `${n} precio${n === 1 ? '' : 's'} publicado${n === 1 ? '' : 's'} en el punto de venta` +
        (!web ? '.' : web.ok ? ' y en la página web.' : `. En la web no se publicaron: ${web.error}`)
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    sendError(res, error, 'Error publicando los precios');
  }
};

module.exports = { listar, obtenerConfig, guardarConfig, asignarMargen, publicar, leerConfig };
