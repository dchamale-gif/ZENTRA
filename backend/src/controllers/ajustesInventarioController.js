const { randomUUID } = require('crypto');
const pool = require('../db/connection');

// Regularizaciones de inventario: carga inicial o conteo físico (se escribe la existencia
// contada y se aplica la diferencia), muerte de animales y descuento de inventario (salidas).
// Cada línea guarda la existencia de antes y de después; anular un ajuste lo revierte.

const TIPOS = {
  carga_inicial: 'Carga inicial / conteo',
  mortalidad: 'Muerte de animales',
  descuento: 'Descuento de inventario'
};
const MOTIVOS = {
  danio: 'Producto dañado',
  vencido: 'Vencido',
  consumo_interno: 'Consumo interno',
  extravio: 'Extravío o robo',
  otro: 'Otro'
};
const MAX_CANTIDAD = 1000000;
const MAX_LINEAS = 5000;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (!error.expose) console.error(fallback, error);
  res.status(error.status || 500).json({ error: error.expose ? error.message : fallback });
};

const userName = (user) => [user.nombre, user.apellido].filter(Boolean).join(' ') || user.email || null;

const entero = (valor, { min, label }) => {
  const numero = Number(valor);
  if (valor === '' || valor === null || valor === undefined || !Number.isInteger(numero) || numero < min || numero > MAX_CANTIDAD) {
    throw httpError(400, `${label} debe ser un número entero entre ${min} y ${MAX_CANTIDAD.toLocaleString('en-US')}`);
  }
  return numero;
};

const RESUMEN_SELECT = `
  SELECT a.id, a.numero, a.tipo, a.motivo, a.fecha, a.observaciones, a.estado,
         a.usuario_nombre, a.created_at, a.anulado_at, a.anulado_por_nombre, a.motivo_anulacion,
         COUNT(i.id)::INTEGER AS lineas,
         COALESCE(SUM(i.cantidad), 0)::INTEGER AS unidades,
         COALESCE(SUM(i.cantidad * COALESCE(i.costo_unitario, 0)), 0) AS valor
  FROM ajustes_inventario a
  LEFT JOIN ajuste_inventario_items i ON i.ajuste_id = a.id
`;

const listar = async (req, res) => {
  try {
    const params = [];
    const filtros = [];
    if (TIPOS[req.query.tipo]) {
      params.push(req.query.tipo);
      filtros.push(`a.tipo = $${params.length}`);
    }
    const { rows } = await pool.query(
      `${RESUMEN_SELECT} ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
       GROUP BY a.id ORDER BY a.fecha DESC, a.created_at DESC LIMIT 500`,
      params
    );
    res.status(200).json({ success: true, ajustes: rows, tipos: TIPOS, motivos: MOTIVOS });
  } catch (error) {
    sendError(res, error, 'Error obteniendo los ajustes de inventario');
  }
};

const detalle = async (req, res) => {
  try {
    const ajuste = await pool.query(`${RESUMEN_SELECT} WHERE a.id = $1 GROUP BY a.id`, [req.params.id]);
    if (!ajuste.rows[0]) throw httpError(404, 'Ajuste no encontrado');
    const items = await pool.query(
      `SELECT i.articulo_id, c.codigo, c.nombre_articulo, i.existencia_anterior, i.cantidad,
              i.existencia_nueva, i.costo_unitario, i.nota
       FROM ajuste_inventario_items i
       JOIN codigos_articulos c ON c.id = i.articulo_id
       WHERE i.ajuste_id = $1
       ORDER BY c.nombre_articulo`,
      [req.params.id]
    );
    res.status(200).json({ success: true, ajuste: { ...ajuste.rows[0], items: items.rows } });
  } catch (error) {
    sendError(res, error, 'Error obteniendo el ajuste');
  }
};

// Lee y valida el cuerpo antes de abrir la transacción.
const leerAjuste = (body) => {
  const tipo = String(body.tipo || '');
  if (!TIPOS[tipo]) throw httpError(400, 'Elige el tipo de ajuste');
  const motivo = tipo === 'descuento' ? String(body.motivo || '') : null;
  if (tipo === 'descuento' && !MOTIVOS[motivo]) throw httpError(400, 'Elige el motivo del descuento');
  const fecha = body.fecha ? String(body.fecha) : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) throw httpError(400, 'La fecha no es válida');
  const observaciones = String(body.observaciones || '').trim().slice(0, 2000) || null;
  if (motivo === 'otro' && !observaciones) throw httpError(400, 'Escribe en observaciones el motivo del descuento');

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw httpError(400, 'Agrega al menos un artículo');
  if (items.length > MAX_LINEAS) throw httpError(400, `Un ajuste admite hasta ${MAX_LINEAS} artículos; divídelo en varios`);
  const vistos = new Set();
  const lineas = items.map((item) => {
    const articuloId = String(item?.articulo_id || '');
    if (!articuloId) throw httpError(400, 'Hay una línea sin artículo');
    if (vistos.has(articuloId)) throw httpError(400, 'Un artículo aparece dos veces; deja una sola línea por artículo');
    vistos.add(articuloId);
    const nota = String(item.nota || '').trim().slice(0, 200) || null;
    return tipo === 'carga_inicial'
      ? { articuloId, existencia: entero(item.existencia, { min: 0, label: 'La existencia contada' }), nota }
      : { articuloId, salida: entero(item.cantidad, { min: 1, label: 'La cantidad a descontar' }), nota };
  });
  return { tipo, motivo, fecha, observaciones, lineas };
};

const crear = async (req, res) => {
  let client;
  try {
    const { tipo, motivo, fecha, observaciones, lineas } = leerAjuste(req.body);

    client = await pool.connect();
    await client.query('BEGIN');
    // Un correlativo por empresa sin choques entre dos ajustes simultáneos.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ajustes_inventario_' || app_current_organization_id()))");
    const articulos = await client.query(
      `SELECT id, codigo, nombre_articulo, COALESCE(cantidad_disponible, 0) AS existencia, precio_costo
       FROM codigos_articulos WHERE id = ANY($1::varchar[]) ORDER BY id FOR UPDATE`,
      [lineas.map((linea) => linea.articuloId)]
    );
    const porId = new Map(articulos.rows.map((row) => [row.id, row]));

    const faltan = [];
    const aplicar = [];
    for (const linea of lineas) {
      const articulo = porId.get(linea.articuloId);
      if (!articulo) throw httpError(400, 'Uno de los artículos ya no existe; recarga la página');
      const anterior = Number(articulo.existencia);
      const cantidad = tipo === 'carga_inicial' ? linea.existencia - anterior : -linea.salida;
      if (cantidad === 0) continue;
      if (anterior + cantidad < 0) {
        faltan.push(`«${articulo.nombre_articulo}» tiene ${anterior} y quieres descontar ${linea.salida}`);
        continue;
      }
      aplicar.push({ articulo, anterior, cantidad, nueva: anterior + cantidad, nota: linea.nota });
    }
    if (faltan.length) {
      throw httpError(409, `No alcanza la existencia: ${faltan.slice(0, 5).join('; ')}${faltan.length > 5 ? ` y ${faltan.length - 5} más` : ''}`);
    }
    if (!aplicar.length) throw httpError(400, 'No hay cambios: las existencias contadas son iguales a las actuales');

    const siguiente = await client.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '\\D', '', 'g'), '')::INTEGER), 0) + 1 AS n
       FROM ajustes_inventario`
    );
    const numero = `AJ-${String(siguiente.rows[0].n).padStart(5, '0')}`;
    const id = `AJ-${randomUUID()}`;
    await client.query(
      `INSERT INTO ajustes_inventario (id, numero, tipo, motivo, fecha, observaciones, user_id, usuario_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, numero, tipo, motivo, fecha, observaciones, req.user.id, userName(req.user)]
    );
    for (const linea of aplicar) {
      await client.query(
        `INSERT INTO ajuste_inventario_items
         (id, ajuste_id, articulo_id, existencia_anterior, cantidad, existencia_nueva, costo_unitario, nota)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [`AJI-${randomUUID()}`, id, linea.articulo.id, linea.anterior, linea.cantidad, linea.nueva,
          linea.articulo.precio_costo, linea.nota]
      );
      await client.query(
        'UPDATE codigos_articulos SET cantidad_disponible = $1, updated_at = NOW() WHERE id = $2',
        [linea.nueva, linea.articulo.id]
      );
    }
    await client.query('COMMIT');

    const sinCambio = lineas.length - aplicar.length;
    res.status(201).json({
      success: true,
      ajuste: { id, numero },
      message: `Ajuste ${numero} aplicado a ${aplicar.length} ${aplicar.length === 1 ? 'artículo' : 'artículos'}`
        + (sinCambio ? ` (${sinCambio} sin cambio)` : '')
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error registrando el ajuste de inventario');
  } finally {
    if (client) client.release();
  }
};

// Anular: se devuelve cada artículo a como estaba sumando o restando la diferencia aplicada,
// así no se pierden las ventas y compras que hubo después del ajuste.
const anular = async (req, res) => {
  let client;
  try {
    const motivo = String(req.body.motivo || '').trim().slice(0, 500);
    if (!motivo) throw httpError(400, 'Escribe el motivo de la anulación');
    client = await pool.connect();
    await client.query('BEGIN');
    const ajuste = await client.query('SELECT id, numero, estado FROM ajustes_inventario WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!ajuste.rows[0]) throw httpError(404, 'Ajuste no encontrado');
    if (ajuste.rows[0].estado === 'anulado') throw httpError(409, 'El ajuste ya estaba anulado');

    const items = await client.query(
      `SELECT i.articulo_id, i.cantidad, c.nombre_articulo, COALESCE(c.cantidad_disponible, 0) AS existencia
       FROM ajuste_inventario_items i
       JOIN codigos_articulos c ON c.id = i.articulo_id
       WHERE i.ajuste_id = $1 ORDER BY i.articulo_id FOR UPDATE OF c`,
      [req.params.id]
    );
    const faltan = items.rows
      .filter((item) => Number(item.existencia) - Number(item.cantidad) < 0)
      .map((item) => `«${item.nombre_articulo}» (quedan ${item.existencia})`);
    if (faltan.length) {
      throw httpError(409, `No se puede anular: ya se vendió o descontó parte de lo que sumó el ajuste: ${faltan.slice(0, 5).join(', ')}`);
    }
    for (const item of items.rows) {
      await client.query(
        'UPDATE codigos_articulos SET cantidad_disponible = COALESCE(cantidad_disponible, 0) - $1, updated_at = NOW() WHERE id = $2',
        [item.cantidad, item.articulo_id]
      );
    }
    await client.query(
      `UPDATE ajustes_inventario SET estado = 'anulado', anulado_at = NOW(), anulado_por_nombre = $2,
       motivo_anulacion = $3 WHERE id = $1`,
      [req.params.id, userName(req.user), motivo]
    );
    await client.query('COMMIT');
    res.status(200).json({ success: true, message: `Ajuste ${ajuste.rows[0].numero} anulado; las existencias se revirtieron` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error anulando el ajuste');
  } finally {
    if (client) client.release();
  }
};

module.exports = { listar, detalle, crear, anular, TIPOS, MOTIVOS };
