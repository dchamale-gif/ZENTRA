const { Client } = require('pg');
const mysql = require('mysql2/promise');

// Conexión de solo lectura a la base de datos externa de una empresa (su página web).
// Los administradores de cada empresa son clientes: solo se permite conectar a los
// servidores que autoriza la plataforma en INTEGRATIONS_ALLOWED_HOSTS. Así nadie puede
// apuntar a la base del propio ERP ni recorrer la red interna del servidor.

const MOTORES = new Set(['postgres', 'mysql']);
const CONNECT_TIMEOUT_MS = 8000;
const QUERY_TIMEOUT_MS = 30000;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const allowedHosts = () => (process.env.INTEGRATIONS_ALLOWED_HOSTS || '')
  .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);

const assertHostAllowed = (host) => {
  const allowed = allowedHosts();
  if (allowed.length === 0) {
    throw httpError(503, 'Este servidor aún no tiene autorizada ninguna base de datos externa; pide a soporte que la habilite');
  }
  if (!allowed.includes(String(host || '').trim().toLowerCase())) {
    throw httpError(400, `El servidor «${host}» no está autorizado. Autorizados: ${allowed.join(', ')}`);
  }
};

// Acepta «tabla» o «esquema.tabla»; cualquier otra cosa se rechaza antes de llegar a SQL.
const parseIdentifier = (value, label) => {
  const parts = String(value || '').trim().split('.');
  if (parts.length > 2 || !parts.every((part) => IDENTIFIER.test(part))) {
    throw httpError(400, `${label} «${value}» no es válido: usa solo letras, números y guion bajo`);
  }
  return parts;
};

const quoteWith = (motor) => (parts) => parts
  .map((part) => (motor === 'mysql' ? `\`${part}\`` : `"${part}"`))
  .join('.');

// escritura: true solo para devolver la existencia a la web (modo de dos vías); si no, la
// sesión queda en solo lectura aunque el usuario de la base pueda escribir.
const connect = async ({ motor, host, puerto, base, usuario, password, ssl, escritura = false }) => {
  if (!MOTORES.has(motor)) throw httpError(400, 'Elige el motor de la base: PostgreSQL o MySQL');
  assertHostAllowed(host);
  const port = Number(puerto) || (motor === 'mysql' ? 3306 : 5432);
  const sslOption = ssl ? { rejectUnauthorized: false } : undefined;

  try {
    if (motor === 'postgres') {
      const client = new Client({
        host, port, database: base, user: usuario, password,
        ssl: sslOption, connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
        statement_timeout: QUERY_TIMEOUT_MS, query_timeout: QUERY_TIMEOUT_MS + 2000
      });
      client.on('error', () => {});
      await client.connect();
      if (!escritura) await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
      return {
        motor,
        param: (index) => `$${index}`,
        query: async (sql, params = []) => (await client.query(sql, params)).rows,
        close: () => client.end().catch(() => {})
      };
    }

    const connection = await mysql.createConnection({
      host, port, database: base, user: usuario, password,
      ssl: sslOption, connectTimeout: CONNECT_TIMEOUT_MS, dateStrings: true, supportBigNumbers: true
    });
    if (!escritura) await connection.query('SET SESSION TRANSACTION READ ONLY');
    return {
      motor,
      param: () => '?',
      query: async (sql, params = []) => (await connection.query({ sql, values: params, timeout: QUERY_TIMEOUT_MS }))[0],
      close: () => connection.end().catch(() => {})
    };
  } catch (error) {
    if (error.status) throw error;
    throw httpError(502, `No se pudo conectar a la base de la web: ${describeConnectionError(error)}`);
  }
};

// Mensajes que dicen qué revisar, sin exponer detalles internos del servidor.
const describeConnectionError = (error) => {
  const code = error.code || '';
  if (['ECONNREFUSED', 'EHOSTUNREACH'].includes(code)) return 'el servidor no acepta conexiones en ese puerto';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'no se encontró el servidor; revisa el nombre';
  if (code === 'ETIMEDOUT' || /timeout/i.test(error.message)) return 'el servidor no respondió a tiempo';
  if (['28P01', 'ER_ACCESS_DENIED_ERROR'].includes(code)) return 'usuario o contraseña incorrectos';
  if (['3D000', 'ER_BAD_DB_ERROR'].includes(code)) return 'la base de datos no existe';
  if (['42501', 'ER_TABLEACCESS_DENIED_ERROR', 'ER_COLUMNACCESS_DENIED_ERROR'].includes(code)) return 'el usuario no tiene permiso';
  return 'revisa servidor, puerto, base, usuario y contraseña';
};

const listTables = async (conn) => {
  const rows = conn.motor === 'mysql'
    ? await conn.query(
      `SELECT table_name AS nombre FROM information_schema.tables
       WHERE table_schema = DATABASE() ORDER BY table_name LIMIT 300`)
    : await conn.query(
      `SELECT CASE WHEN table_schema = current_schema() THEN table_name
                   ELSE table_schema || '.' || table_name END AS nombre
       FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY table_schema <> current_schema(), table_schema, table_name LIMIT 300`);
  return rows.map((row) => row.nombre ?? row.NOMBRE);
};

const listColumns = async (conn, tabla) => {
  const parts = parseIdentifier(tabla, 'La tabla');
  const [schema, table] = parts.length === 2 ? parts : [null, parts[0]];
  const rows = conn.motor === 'mysql'
    ? await conn.query(
      `SELECT column_name AS nombre FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`, [table])
    : await conn.query(
      `SELECT column_name AS nombre FROM information_schema.columns
       WHERE table_schema = COALESCE($1, current_schema()) AND table_name = $2 ORDER BY ordinal_position`,
      [schema, table]);
  return rows.map((row) => row.nombre ?? row.NOMBRE);
};

const MAX_TABLAS = 300;

// Todas las tablas con sus columnas (nombre y tipo) y las filas aproximadas, en dos consultas.
const describeSchema = async (conn) => {
  const [columnas, filas] = conn.motor === 'mysql'
    ? await Promise.all([
      conn.query(
        `SELECT table_name AS tabla, column_name AS columna, data_type AS tipo
         FROM information_schema.columns
         WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position LIMIT 20000`),
      conn.query(
        `SELECT table_name AS tabla, table_rows AS filas FROM information_schema.tables
         WHERE table_schema = DATABASE()`)
    ])
    : await Promise.all([
      conn.query(
        `SELECT CASE WHEN table_schema = current_schema() THEN table_name
                     ELSE table_schema || '.' || table_name END AS tabla,
                column_name AS columna, data_type AS tipo
         FROM information_schema.columns
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         ORDER BY table_schema <> current_schema(), table_schema, table_name, ordinal_position LIMIT 20000`),
      conn.query(
        `SELECT CASE WHEN schemaname = current_schema() THEN relname
                     ELSE schemaname || '.' || relname END AS tabla, n_live_tup AS filas
         FROM pg_stat_user_tables`)
    ]);
  const estimadas = new Map(filas.map((row) => [row.tabla ?? row.TABLA, row.filas ?? row.FILAS]));
  const tablas = new Map();
  for (const row of columnas) {
    const tabla = row.tabla ?? row.TABLA;
    if (!tablas.has(tabla)) {
      if (tablas.size >= MAX_TABLAS) break;
      const estimada = estimadas.get(tabla);
      tablas.set(tabla, { nombre: tabla, filas: estimada === undefined || estimada === null ? null : Number(estimada), columnas: [] });
    }
    tablas.get(tabla).columnas.push({ nombre: row.columna ?? row.COLUMNA, tipo: row.tipo ?? row.TIPO });
  }
  return [...tablas.values()];
};

// Valor de una celda para mostrarlo en la vista previa: corto y sin traer imágenes completas.
const resumirValor = (value) => {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return `[binario, ${Math.ceil(value.length / 1024)} KB]`;
  const texto = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (texto.length > 300) return `[texto de ${Math.ceil(texto.length / 1024)} KB: ${texto.slice(0, 40)}…]`;
  return texto.length > 80 ? `${texto.slice(0, 80)}…` : texto;
};

// Primeras filas de una tabla con todas sus columnas, para reconocer qué guarda cada una.
const previewTable = async (conn, tabla, limite = 5) => {
  const table = quoteWith(conn.motor)(parseIdentifier(tabla, 'La tabla'));
  const rows = await conn.query(`SELECT * FROM ${table} LIMIT ${Number(limite)}`);
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, resumirValor(value)])));
};

// Huella del valor de la foto calculada en la base remota: evita traer la imagen si no cambió.
const md5Expression = (motor, quotedColumn) => (motor === 'mysql'
  ? `MD5(${quotedColumn})`
  : `md5(${quotedColumn}::text)`);

module.exports = {
  connect, describeConnectionError, listTables, listColumns, describeSchema, previewTable, parseIdentifier, quoteWith, md5Expression,
  allowedHosts, httpError
};
