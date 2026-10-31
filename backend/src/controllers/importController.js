const pool = require('../db/connection');
const { getNextCodigo } = require('./codigosArticulosController');
const { text, number, bool, runImport, rowError } = require('../utils/bulkImport');
const { guardarFoto } = require('../utils/fotos');

const isDryRun = (req) => req.body.dryRun === true;

const sendResult = (res, req, summary) =>
  res.status(200).json({ success: true, dryRun: isDryRun(req), ...summary });

const handleFailure = (res, error, label) => {
  console.error(`Error en ${label}:`, error);
  res.status(error.status || 500).json({ error: error.message || `Error en ${label}` });
};

/**
 * POST /api/proveedores/import
 * Upsert por NIT (si viene) o por nombre exacto.
 */
const importProveedores = async (req, res) => {
  try {
    const summary = await runImport(pool, req.body.rows, async (client, raw) => {
      const data = {
        nombre: text(raw.nombre),
        razon_social: text(raw.razon_social),
        nit: text(raw.nit),
        email: text(raw.email)?.toLowerCase() || null,
        telefono: text(raw.telefono),
        direccion: text(raw.direccion),
        ciudad: text(raw.ciudad),
        contacto: text(raw.contacto)
      };
      if (!data.nombre) throw rowError('El nombre es requerido');

      const existing = await client.query(
        `SELECT id FROM proveedores
         WHERE ($1::text IS NOT NULL AND nit = $1)
            OR ($1::text IS NULL AND LOWER(nombre) = LOWER($2))
         LIMIT 1`,
        [data.nit, data.nombre]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE proveedores
           SET nombre = $1, email = COALESCE($2, email), telefono = COALESCE($3, telefono),
               direccion = COALESCE($4, direccion), ciudad = COALESCE($5, ciudad),
               razon_social = COALESCE($6, razon_social), contacto = COALESCE($7, contacto),
               updated_at = NOW()
           WHERE id = $8`,
          [data.nombre, data.email, data.telefono, data.direccion, data.ciudad,
            data.razon_social, data.contacto, existing.rows[0].id]
        );
        return 'updated';
      }

      const id = `PRV-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      await client.query(
        `INSERT INTO proveedores
         (id, nombre, email, telefono, direccion, ciudad, razon_social, nit, contacto, activo,
          created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())`,
        [id, data.nombre, data.email, data.telefono, data.direccion, data.ciudad,
          data.razon_social, data.nit, data.contacto]
      );
      return 'created';
    }, { dryRun: isDryRun(req) });

    sendResult(res, req, summary);
  } catch (error) {
    handleFailure(res, error, 'importProveedores');
  }
};

// El id de codigos_articulos es texto sin valor por defecto en algunas instalaciones.
const articuloIdIsManual = async (db) => {
  const result = await db.query(
    `SELECT data_type, column_default, is_identity
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'codigos_articulos' AND column_name = 'id'`
  );
  const idColumn = result.rows[0];
  return Boolean(idColumn &&
    ['character varying', 'character', 'text'].includes(idColumn.data_type) &&
    !idColumn.column_default && idColumn.is_identity !== 'YES');
};

const ARTICULO_UPDATE_COLUMNS = [
  'nombre_articulo', 'descripcion', 'categoria', 'familia', 'subfamilia', 'precio_unitario',
  'precio_costo', 'cantidad_disponible', 'unidad_medida', 'codigo_barras', 'tipo', 'activo'
];

/**
 * Crea o actualiza un artículo por código (lo usan la importación desde Excel y la
 * sincronización con la web). Los campos que no vienen conservan su valor.
 * raw._foto = { valor, origenHash } viene de la sincronización; raw.foto, de la importación.
 * raw._soloAlCrear: columnas que se usan al crear el artículo pero no al actualizarlo.
 * Devuelve 'created', 'updated' o 'unchanged'.
 */
const upsertArticulo = async (client, raw, index, { requiresManualId }) => {
  const activoRaw = raw.activo;
  const data = {
    codigo: text(raw.codigo),
    nombre_articulo: text(raw.nombre_articulo),
    descripcion: text(raw.descripcion),
    categoria: text(raw.categoria),
    familia: text(raw.familia),
    subfamilia: text(raw.subfamilia),
    precio_unitario: number(raw.precio_unitario),
    precio_costo: number(raw.precio_costo),
    cantidad_disponible: number(raw.cantidad_disponible),
    unidad_medida: text(raw.unidad_medida),
    codigo_barras: text(raw.codigo_barras),
    tipo: text(raw.tipo)?.toLowerCase() || null,
    activo: activoRaw === undefined || activoRaw === null || String(activoRaw).trim() === '' ? null : bool(activoRaw)
  };
  if (!data.nombre_articulo) throw rowError('El nombre del artículo es requerido');
  for (const field of ['precio_unitario', 'precio_costo', 'cantidad_disponible']) {
    if (Number.isNaN(data[field])) throw rowError(`Valor numérico inválido en ${field}`);
    if (data[field] !== null && data[field] < 0) throw rowError(`${field} no puede ser negativo`);
  }
  const foto = raw._foto
    ? [raw._foto.valor, { origenHash: raw._foto.origenHash }]
    : [text(raw.foto) || undefined];

  if (data.codigo) {
    const existing = await client.query(
      'SELECT id FROM codigos_articulos WHERE codigo = $1', [data.codigo]
    );
    if (existing.rows.length > 0) {
      const id = existing.rows[0].id;
      // Lo que solo se copia al crear (p. ej. existencia de la web) no pisa al artículo existente.
      (raw._soloAlCrear || []).forEach((column) => { data[column] = null; });
      // nombre_articulo siempre viene; el resto conserva su valor si llega vacío.
      const values = ARTICULO_UPDATE_COLUMNS.map((column) => data[column]);
      const expressions = ARTICULO_UPDATE_COLUMNS.map((column, i) =>
        (column === 'nombre_articulo' ? `$${i + 1}` : `COALESCE($${i + 1}, ${column})`));
      const result = await client.query(
        `UPDATE codigos_articulos
         SET ${ARTICULO_UPDATE_COLUMNS.map((column, i) => `${column} = ${expressions[i]}`).join(', ')},
             updated_at = NOW()
         WHERE id = $${values.length + 1}
           AND ROW(${ARTICULO_UPDATE_COLUMNS.join(', ')}) IS DISTINCT FROM ROW(${expressions.join(', ')})
         RETURNING id`,
        [...values, id]
      );
      await guardarFoto(client, id, ...foto);
      return result.rows.length > 0 || foto[0] !== undefined ? 'updated' : 'unchanged';
    }
  } else {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('codigos_articulos_codigo_correlativo'))");
    data.codigo = await getNextCodigo(client);
  }

  const values = [data.codigo, data.nombre_articulo, data.descripcion, data.categoria,
    data.familia, data.subfamilia, data.precio_unitario ?? 0, data.precio_costo ?? 0,
    data.cantidad_disponible ?? 0, data.unidad_medida, data.codigo_barras, data.tipo || 'producto',
    data.activo ?? true];
  const generatedId = `ART-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const offset = requiresManualId ? 2 : 1;

  const inserted = await client.query(
    `INSERT INTO codigos_articulos
     (${requiresManualId ? 'id, ' : ''}codigo, nombre_articulo, descripcion, categoria, familia,
      subfamilia, precio_unitario, precio_costo, cantidad_disponible, unidad_medida,
      codigo_barras, tipo, activo, created_at, updated_at)
     VALUES (${requiresManualId ? '$1, ' : ''}${values.map((_, i) => `$${i + offset}`).join(', ')}, NOW(), NOW())
     RETURNING id`,
    requiresManualId ? [generatedId, ...values] : values
  );
  await guardarFoto(client, inserted.rows[0].id, ...foto);
  return 'created';
};

/**
 * POST /api/codigos-articulos/import
 * Upsert por código; si no viene código se genera el siguiente correlativo.
 * Cada fila puede traer «foto» en base64; si no la trae, la foto actual se conserva.
 */
const importArticulos = async (req, res) => {
  try {
    const options = { requiresManualId: await articuloIdIsManual(pool) };
    const summary = await runImport(pool, req.body.rows,
      (client, raw, index) => upsertArticulo(client, raw, index, options),
      { dryRun: isDryRun(req) });
    sendResult(res, req, summary);
  } catch (error) {
    handleFailure(res, error, 'importArticulos');
  }
};

module.exports = { importProveedores, importArticulos, upsertArticulo, articuloIdIsManual };
