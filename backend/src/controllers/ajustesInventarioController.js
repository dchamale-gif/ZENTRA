const { randomUUID } = require('crypto');
const pool = require('../db/connection');

// Regularizaciones de inventario. Los tipos de ajuste los configura cada empresa y cada uno tiene
// un efecto: «conteo» (se escribe la existencia contada y se aplica la diferencia), «salida»
// (descuenta: muerte de animales, producto dañado, vencido…) o «entrada» (suma).
// Cada línea guarda la existencia de antes y de después; anular un ajuste lo revierte.

const EFECTOS = {
  conteo: 'Conteo: escribir la existencia contada',
  salida: 'Descuenta del inventario',
  entrada: 'Suma al inventario'
};
// Tipos de fábrica para una empresa sin ninguno (los mismos que siembra la migración).
const TIPOS_INICIALES = [
  ['Carga inicial / conteo físico', 'conteo', false],
  ['Muerte de animales', 'salida', false],
  ['Producto dañado', 'salida', false],
  ['Vencido', 'salida', false],
  ['Consumo interno', 'salida', false],
  ['Extravío o robo', 'salida', false],
  ['Otro descuento', 'salida', true],
  ['Entrada por ajuste', 'entrada', true]
];
const MAX_CANTIDAD = 1000000;
const MAX_LINEAS = 5000;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un tipo de ajuste con ese nombre' });
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

// ---------- Tipos de ajuste ----------

const TIPO_COLUMNAS = 'id, nombre, efecto, requiere_observaciones, activo, orden';
const mapTipo = (row) => ({
  id: row.id,
  nombre: row.nombre,
  efecto: row.efecto,
  requiereObservaciones: row.requiere_observaciones,
  activo: row.activo,
  orden: row.orden
});

const cargarTipos = async () => {
  const consulta = () => pool.query(`SELECT ${TIPO_COLUMNAS} FROM tipos_ajuste_inventario ORDER BY orden, nombre`);
  let { rows } = await consulta();
  if (!rows.length) {
    // Empresa nueva: recibe los tipos de fábrica la primera vez.
    for (const [indice, [nombre, efecto, requiere]] of TIPOS_INICIALES.entries()) {
      await pool.query(
        `INSERT INTO tipos_ajuste_inventario (id, nombre, efecto, requiere_observaciones, orden)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [`TAJ-${randomUUID()}`, nombre, efecto, requiere, indice + 1]
      );
    }
    ({ rows } = await consulta());
  }
  return rows.map(mapTipo);
};

const listarTipos = async (req, res) => {
  try {
    res.status(200).json({ success: true, tipos: await cargarTipos(), efectos: EFECTOS });
  } catch (error) {
    sendError(res, error, 'Error obteniendo los tipos de ajuste');
  }
};

const leerTipo = (body, { parcial = false } = {}) => {
  const datos = {};
  if (!parcial || body.nombre !== undefined) {
    datos.nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!datos.nombre) throw httpError(400, 'Escribe el nombre del tipo de ajuste');
  }
  if (!parcial || body.efecto !== undefined) {
    datos.efecto = String(body.efecto || '');
    if (!EFECTOS[datos.efecto]) throw httpError(400, 'Elige si el tipo descuenta, suma o es un conteo');
  }
  if (body.requiereObservaciones !== undefined) datos.requiere_observaciones = body.requiereObservaciones === true;
  if (parcial && body.activo !== undefined) datos.activo = body.activo === true;
  return datos;
};

const crearTipo = async (req, res) => {
  try {
    const datos = leerTipo(req.body);
    const orden = await pool.query('SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM tipos_ajuste_inventario');
    const { rows } = await pool.query(
      `INSERT INTO tipos_ajuste_inventario (id, nombre, efecto, requiere_observaciones, orden)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${TIPO_COLUMNAS}`,
      [`TAJ-${randomUUID()}`, datos.nombre, datos.efecto, datos.requiere_observaciones === true, orden.rows[0].n]
    );
    res.status(201).json({ success: true, tipo: mapTipo(rows[0]), message: `Tipo «${datos.nombre}» creado` });
  } catch (error) {
    sendError(res, error, 'Error creando el tipo de ajuste');
  }
};

// Cambiar nombre, efecto, si pide observaciones o activarlo/desactivarlo. Los ajustes ya hechos
// conservan el nombre y el efecto con que se registraron.
const actualizarTipo = async (req, res) => {
  try {
    const datos = leerTipo(req.body, { parcial: true });
    const campos = Object.keys(datos);
    if (!campos.length) throw httpError(400, 'No hay cambios');
    const { rows } = await pool.query(
      `UPDATE tipos_ajuste_inventario SET ${campos.map((campo, i) => `${campo} = $${i + 2}`).join(', ')}, updated_at = NOW()
       WHERE id = $1 RETURNING ${TIPO_COLUMNAS}`,
      [req.params.id, ...campos.map((campo) => datos[campo])]
    );
    if (!rows[0]) throw httpError(404, 'Tipo de ajuste no encontrado');
    res.status(200).json({ success: true, tipo: mapTipo(rows[0]), message: `Tipo «${rows[0].nombre}» guardado` });
  } catch (error) {
    sendError(res, error, 'Error guardando el tipo de ajuste');
  }
};

// ---------- Ajustes ----------

const RESUMEN_SELECT = `
  SELECT a.id, a.numero, a.tipo_ajuste_id, a.tipo_nombre, a.efecto, a.fecha, a.observaciones, a.estado,
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
    let where = '';
    if (req.query.tipo) {
      params.push(String(req.query.tipo));
      where = 'WHERE a.tipo_ajuste_id = $1';
    }
    const { rows } = await pool.query(
      `${RESUMEN_SELECT} ${where} GROUP BY a.id ORDER BY a.fecha DESC, a.created_at DESC LIMIT 500`,
      params
    );
    res.status(200).json({ success: true, ajustes: rows });
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
const leerAjuste = async (body) => {
  const tipoId = String(body.tipoId || '');
  if (!tipoId) throw httpError(400, 'Elige el tipo de ajuste');
  const tipoRow = (await pool.query(`SELECT ${TIPO_COLUMNAS} FROM tipos_ajuste_inventario WHERE id = $1`, [tipoId])).rows[0];
  if (!tipoRow) throw httpError(400, 'Ese tipo de ajuste ya no existe; recarga la página');
  const tipo = mapTipo(tipoRow);
  if (!tipo.activo) throw httpError(400, `El tipo «${tipo.nombre}» está desactivado; elige otro`);

  const fecha = body.fecha ? String(body.fecha) : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) throw httpError(400, 'La fecha no es válida');
  const observaciones = String(body.observaciones || '').trim().slice(0, 2000) || null;
  if (tipo.requiereObservaciones && !observaciones) throw httpError(400, `Para «${tipo.nombre}» escribe en observaciones el motivo`);

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
    return tipo.efecto === 'conteo'
      ? { articuloId, existencia: entero(item.existencia, { min: 0, label: 'La existencia contada' }), nota }
      : { articuloId, cantidad: entero(item.cantidad, { min: 1, label: tipo.efecto === 'salida' ? 'La cantidad a descontar' : 'La cantidad a sumar' }), nota };
  });
  return { tipo, fecha, observaciones, lineas };
};

const crear = async (req, res) => {
  let client;
  try {
    const { tipo, fecha, observaciones, lineas } = await leerAjuste(req.body);

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
      const cantidad = tipo.efecto === 'conteo' ? linea.existencia - anterior
        : tipo.efecto === 'salida' ? -linea.cantidad : linea.cantidad;
      if (cantidad === 0) continue;
      if (anterior + cantidad < 0) {
        faltan.push(`«${articulo.nombre_articulo}» tiene ${anterior} y quieres descontar ${linea.cantidad}`);
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
      `INSERT INTO ajustes_inventario (id, numero, tipo_ajuste_id, tipo_nombre, efecto, fecha, observaciones, user_id, usuario_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, numero, tipo.id, tipo.nombre, tipo.efecto, fecha, observaciones, req.user.id, userName(req.user)]
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
      message: `Ajuste ${numero} (${tipo.nombre}) aplicado a ${aplicar.length} ${aplicar.length === 1 ? 'artículo' : 'artículos'}`
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

module.exports = { listar, detalle, crear, anular, listarTipos, crearTipo, actualizarTipo };
