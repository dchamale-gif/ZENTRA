const { Pool } = require('pg');
require('dotenv').config();
const { getTenantId } = require('./tenantContext');
const { getDbSslConfig } = require('./sslConfig');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'zentra',
  ssl: getDbSslConfig(),
});

pool.on('error', (err) => {
  console.error('❌ Error no esperado en cliente de Pool', err);
});

const connectWithoutTenant = pool.connect.bind(pool);
const queryWithoutTenant = pool.query.bind(pool);

const configureTenant = async (client, organizationId) => {
  await client.query(
    "SELECT set_config('app.current_organization_id', $1, false)",
    [String(organizationId)]
  );
};

pool.connect = async () => {
  const client = await connectWithoutTenant();
  const organizationId = getTenantId();

  if (!organizationId) {
    return client;
  }

  try {
    await configureTenant(client, organizationId);
  } catch (error) {
    client.release();
    throw error;
  }

  const releaseWithoutReset = client.release.bind(client);
  let released = false;
  client.release = () => {
    if (released) return;
    released = true;
    client.query('RESET app.current_organization_id')
      .then(() => releaseWithoutReset())
      .catch((error) => {
        console.error('Error limpiando el contexto de empresa:', error);
        releaseWithoutReset(error);
      });
  };

  return client;
};

pool.query = async (...args) => {
  const organizationId = getTenantId();
  if (!organizationId) {
    return queryWithoutTenant(...args);
  }

  const client = await connectWithoutTenant();
  try {
    await configureTenant(client, organizationId);
    return await client.query(...args);
  } finally {
    try {
      await client.query('RESET app.current_organization_id');
    } finally {
      client.release();
    }
  }
};

// Test conexión
queryWithoutTenant('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error conectando a la DB:', err);
  } else {
    console.log('✅ Conexión a PostgreSQL establecida');
  }
});

module.exports = pool;
