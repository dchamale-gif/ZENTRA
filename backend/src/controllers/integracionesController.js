const pool = require('../db/connection');
const { getTenantId } = require('../db/tenantContext');
const { encrypt, decrypt } = require('../utils/secretBox');
const { runImport, rowError, MAX_IMPORT_ROWS } = require('../utils/bulkImport');
const { upsertArticulo, articuloIdIsManual } = require('./importController');
const {
  connect, listTables, listColumns, parseIdentifier, quoteWith, md5Expression, allowedHosts, httpError
} = require('../utils/webDb');

// Integración «web»: el ERP lee los productos de la base de datos de la página web de
// la empresa y los carga en Artículos (una vía: web → ERP).
const TIPO = 'web_db';
const CAMPOS = ['codigo', 'nombre', 'precio', 'categoria', 'familia', 'descripcion', 'existencia', 'foto'];
const FOTO_BATCH = 100;
const MAX_AUTO_MINUTOS = 1440;

// Una sincronización por empresa a la vez; las solicitudes que llegan mientras tanto esperan la misma.
const enCurso = new Map();

const sendError = (res, error, fallback) => {
  if (error.status && error.status < 500 || error.expose) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  console.error(fallback, error);
  res.status(error.status || 500).json({ error: fallback });
};

const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);

// Valida y normaliza lo que llega del formulario. No incluye la contraseña.
const normalizeConfig = (body) => {
  const config = {
    motor: text(body.motor, 10),
    host: text(body.host, 255),
    puerto: Number(body.puerto) || null,
    base: text(body.base, 120),
    usuario: text(body.usuario, 120),
    ssl: body.ssl === true,
    tabla: text(body.tabla, 130),
    columnas: {},
    copiarExistencia: body.copiarExistencia === true,
    autoMinutos: Math.min(Math.max(Math.round(Number(body.autoMinutos) || 0), 0), MAX_AUTO_MINUTOS)
  };
  if (!['postgres', 'mysql'].includes(config.motor)) throw httpError(400, 'Elige el motor de la base: PostgreSQL o MySQL');
  if (!config.host || !config.base || !config.usuario) {
    throw httpError(400, 'Completa servidor, base de datos y usuario');
  }
  if (config.puerto !== null && (!Number.isInteger(config.puerto) || config.puerto < 1 || config.puerto > 65535)) {
    throw httpError(400, 'El puerto debe ser un número entre 1 y 65535');
  }
  if (config.tabla) parseIdentifier(config.tabla, 'La tabla');
  for (const campo of CAMPOS) {
    const column = text(body.columnas?.[campo], 63);
    if (column) {
      parseIdentifier(column, `La columna de ${campo}`);
      config.columnas[campo] = column;
    }
  }
  return config;
};

const loadIntegracion = async () => {
  const result = await pool.query(
    'SELECT activa, config, secreto, ultima_sync_at, ultima_sync_resultado FROM integraciones WHERE tipo = $1',
    [TIPO]
  );
  return result.rows[0] || null;
};

const publicView = (row) => ({
  configurada: Boolean(row),
  activa: row?.activa ?? false,
  config: row?.config || null,
  passwordGuardada: Boolean(row?.secreto),
  ultimaSync: row?.ultima_sync_at || null,
  resultado: row?.ultima_sync_resultado || null,
  servidoresAutorizados: allowedHosts(),
  habilitada: Boolean(process.env.INTEGRATIONS_KEY && process.env.INTEGRATIONS_KEY.length >= 32)
});

const passwordFor = (row, provided) => {
  if (provided) return String(provided);
  if (!row?.secreto) return '';
  try {
    return decrypt(row.secreto, getTenantId());
  } catch (error) {
    if (error.status) throw error;
    throw httpError(400, 'La contraseña guardada ya no se puede leer (cambió la llave del servidor); escríbela de nuevo y guarda');
  }
};

const getConfig = async (req, res) => {
  try {
    res.status(200).json({ success: true, integracion: publicView(await loadIntegracion()) });
  } catch (error) {
    sendError(res, error, 'Error obteniendo la integración');
  }
};

const saveConfig = async (req, res) => {
  try {
    const config = normalizeConfig(req.body);
    if (!config.tabla || !config.columnas.codigo || !config.columnas.nombre) {
      throw httpError(400, 'Indica la tabla de productos y las columnas de código y nombre');
    }
    const existing = await loadIntegracion();
    const secreto = req.body.password
      ? encrypt(String(req.body.password), getTenantId())
      : existing?.secreto || null;
    await pool.query(
      `INSERT INTO integraciones (tipo, activa, config, secreto, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (organization_id, tipo) DO UPDATE
       SET activa = EXCLUDED.activa, config = EXCLUDED.config, secreto = EXCLUDED.secreto, updated_at = NOW()`,
      [TIPO, req.body.activa !== false, config, secreto]
    );
    res.status(200).json({ success: true, integracion: publicView(await loadIntegracion()) });
  } catch (error) {
    sendError(res, error, 'Error guardando la integración');
  }
};

const deleteConfig = async (req, res) => {
  try {
    await pool.query('DELETE FROM integraciones WHERE tipo = $1', [TIPO]);
    res.status(200).json({ success: true, integracion: publicView(null) });
  } catch (error) {
    sendError(res, error, 'Error quitando la integración');
  }
};

// Prueba con lo que hay en el formulario (sin guardar): tablas, columnas y una muestra.
const probar = async (req, res) => {
  let conn;
  try {
    const config = normalizeConfig(req.body);
    const password = passwordFor(await loadIntegracion(), req.body.password);
    conn = await connect({ ...config, password });
    const tablas = await listTables(conn);
    let columnas = [];
    let muestra = [];
    let total = null;
    if (config.tabla) {
      columnas = await listColumns(conn, config.tabla);
      if (!columnas.length) throw httpError(400, `No se encontró la tabla «${config.tabla}» o el usuario no puede leerla`);
      const faltantes = Object.values(config.columnas).filter((column) => !columnas.includes(column));
      if (faltantes.length) throw httpError(400, `Estas columnas no existen en «${config.tabla}»: ${faltantes.join(', ')}`);
      if (config.columnas.codigo && config.columnas.nombre) {
        const quote = quoteWith(conn.motor);
        const table = quote(parseIdentifier(config.tabla, 'La tabla'));
        total = Number((await conn.query(`SELECT COUNT(*) AS total FROM ${table}`))[0].total);
        const rows = await conn.query(`${selectSinFoto(conn.motor, config)} LIMIT 3`);
        muestra = rows.map((row) => ({ ...mapRow(row), foto: row.foto_md5 ? 'sí' : 'no' }));
      }
    }
    res.status(200).json({ success: true, tablas, columnas, muestra, total });
  } catch (error) {
    sendError(res, error, 'Error probando la conexión');
  } finally {
    if (conn) conn.close();
  }
};

// SELECT con todas las columnas mapeadas; de la foto solo su huella (MD5), no la imagen.
const selectSinFoto = (motor, config) => {
  const quote = quoteWith(motor);
  const select = CAMPOS
    .filter((campo) => campo !== 'foto' && config.columnas[campo])
    .map((campo) => `${quote(parseIdentifier(config.columnas[campo], campo))} AS ${quote([campo])}`);
  if (config.columnas.foto) {
    select.push(`${md5Expression(motor, quote(parseIdentifier(config.columnas.foto, 'foto')))} AS ${quote(['foto_md5'])}`);
  }
  return `SELECT ${select.join(', ')} FROM ${quote(parseIdentifier(config.tabla, 'La tabla'))}`;
};

const mapRow = (row) => ({
  codigo: row.codigo == null ? '' : String(row.codigo).trim(),
  nombre: row.nombre ?? null,
  precio: row.precio ?? null,
  categoria: row.categoria ?? null,
  familia: row.familia ?? null,
  descripcion: row.descripcion ?? null,
  existencia: row.existencia ?? null
});

const sincronizarWeb = async (row) => {
  const { config } = row;
  const started = Date.now();
  const conn = await connect({ ...config, password: passwordFor(row) });
  let rows;
  const fotos = new Map();
  try {
    rows = await conn.query(`${selectSinFoto(conn.motor, config)} LIMIT ${MAX_IMPORT_ROWS + 1}`);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw httpError(400, `La tabla tiene más de ${MAX_IMPORT_ROWS} productos; pide a soporte que amplíe el límite`);
    }

    // Solo se traen las fotos que cambiaron desde la última vez.
    if (config.columnas.foto) {
      const actuales = await pool.query(
        `SELECT a.codigo, f.origen_hash FROM codigos_articulos a
         LEFT JOIN articulo_fotos f ON f.articulo_id = a.id`
      );
      const origen = new Map(actuales.rows.map((r) => [r.codigo, r.origen_hash]));
      const cambiadas = rows
        .filter((r) => r.foto_md5 && origen.get(String(r.codigo).trim()) !== r.foto_md5)
        .map((r) => r.codigo);
      const quote = quoteWith(conn.motor);
      const codigoCol = quote(parseIdentifier(config.columnas.codigo, 'codigo'));
      const fotoCol = quote(parseIdentifier(config.columnas.foto, 'foto'));
      const table = quote(parseIdentifier(config.tabla, 'La tabla'));
      for (let i = 0; i < cambiadas.length; i += FOTO_BATCH) {
        const batch = cambiadas.slice(i, i + FOTO_BATCH);
        const placeholders = batch.map((_, index) => conn.param(index + 1)).join(', ');
        const fotoRows = await conn.query(
          `SELECT ${codigoCol} AS codigo, ${fotoCol} AS foto, ${md5Expression(conn.motor, fotoCol)} AS foto_md5
           FROM ${table} WHERE ${codigoCol} IN (${placeholders})`,
          batch
        );
        fotoRows.forEach((r) => fotos.set(String(r.codigo).trim(), { valor: r.foto, origenHash: r.foto_md5 }));
      }
      // Foto quitada en la web: se quita en el ERP solo si había venido de la web.
      rows.forEach((r) => {
        const codigo = String(r.codigo ?? '').trim();
        if (!r.foto_md5 && origen.get(codigo)) fotos.set(codigo, { valor: null, origenHash: null });
      });
    }
  } finally {
    conn.close();
  }

  const importRows = rows
    .map((r) => ({ r, data: mapRow(r) }))
    .filter(({ data }) => data.codigo)
    .map(({ data }) => ({
      codigo: data.codigo,
      nombre_articulo: data.nombre,
      precio_unitario: data.precio,
      categoria: data.categoria,
      familia: data.familia,
      descripcion: data.descripcion,
      // La existencia la lleva el ERP (las ventas la descuentan) salvo que se pida copiarla.
      cantidad_disponible: config.copiarExistencia ? data.existencia : undefined,
      _foto: fotos.get(data.codigo)
    }));
  const sinCodigo = rows.length - importRows.length;

  let summary = { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] };
  if (importRows.length) {
    const options = { requiresManualId: await articuloIdIsManual(pool) };
    summary = await runImport(pool, importRows, async (client, raw, index) => {
      try {
        return await upsertArticulo(client, raw, index, options);
      } catch (error) {
        throw rowError(`«${raw.codigo}»: ${error.expose ? error.message : 'no se pudo guardar'}`);
      }
    });
  }

  const resultado = {
    ok: true,
    total: rows.length,
    creados: summary.created,
    actualizados: summary.updated,
    sinCambios: summary.unchanged,
    fallidos: summary.failed + sinCodigo,
    fotosDescargadas: [...fotos.values()].filter((foto) => foto.valor).length,
    errores: [
      ...(sinCodigo ? [sinCodigo === 1
        ? '1 producto sin código en la web no se importó'
        : `${sinCodigo} productos sin código en la web no se importaron`] : []),
      ...summary.errors.slice(0, 20).map((error) => error.message)
    ],
    segundos: Math.round((Date.now() - started) / 100) / 10
  };
  await guardarResultado(resultado);
  return resultado;
};

const guardarResultado = (resultado) => pool.query(
  'UPDATE integraciones SET ultima_sync_at = NOW(), ultima_sync_resultado = $2 WHERE tipo = $1',
  [TIPO, resultado]
);

/**
 * POST /api/integraciones/web/sincronizar   { auto?: true }
 * auto: la pide el punto de venta o Artículos al abrirse; solo corre si pasó el
 * intervalo configurado. Sin auto, la pide un usuario con el botón «Sincronizar ahora».
 */
const sincronizar = async (req, res) => {
  const organizationId = getTenantId();
  try {
    const auto = req.body?.auto === true;
    if (!auto && !req.userPermissions.some((p) => ['admin_config', 'inventario_edit'].includes(p))) {
      throw httpError(403, 'No tienes permiso para sincronizar; pide acceso al administrador');
    }
    const row = await loadIntegracion();
    if (!row || !row.activa) {
      if (auto) return res.status(200).json({ success: true, omitida: true });
      throw httpError(400, 'Primero configura y activa la conexión con la página web en Configuración');
    }
    if (auto) {
      const minutos = Number(row.config.autoMinutos) || 0;
      const ultima = row.ultima_sync_at ? new Date(row.ultima_sync_at).getTime() : 0;
      if (!minutos || Date.now() - ultima < minutos * 60000) {
        return res.status(200).json({ success: true, omitida: true });
      }
    }

    if (!enCurso.has(organizationId)) {
      enCurso.set(organizationId, sincronizarWeb(row)
        .catch(async (error) => {
          // Se registra el fallo para que el administrador lo vea en Configuración.
          await guardarResultado({ ok: false, error: error.expose || error.status ? error.message : 'Error inesperado' })
            .catch(() => {});
          throw error;
        })
        .finally(() => enCurso.delete(organizationId)));
    }
    const resultado = await enCurso.get(organizationId);
    res.status(200).json({ success: true, resultado });
  } catch (error) {
    sendError(res, error, 'Error sincronizando con la página web');
  }
};

module.exports = { getConfig, saveConfig, deleteConfig, probar, sincronizar };
