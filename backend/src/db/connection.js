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
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Error no esperado en cliente de Pool:', err);
});

const connectWithoutTenant = pool.connect.bind(pool);

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
    client.release(error);
    throw error;
  }

  const releaseWithoutReset = client.release.bind(client);
  let released = false;

  client.release = (error) => {
    if (released) return;
    released = true;

    if (error) {
      releaseWithoutReset(error);
      return;
    }

    client.query('RESET app.current_organization_id')
      .then(() => releaseWithoutReset())
      .catch((resetError) => {
        console.error('Error limpiando el contexto de empresa:', resetError);
        releaseWithoutReset(resetError);
      });
  };

  return client;
};

pool.query = async (...args) => {
  const organizationId = getTenantId();
  const client = await connectWithoutTenant();

  try {
    if (organizationId) {
      await configureTenant(client, organizationId);
    }

    return await client.query(...args);
  } finally {
    if (organizationId) {
      try {
        await client.query('RESET app.current_organization_id');
      } catch (error) {
        client.release(error);
        throw error;
      }
    }

    client.release();
  }
};

pool.query('SELECT NOW()')
  .then(() => {
    console.log('Conexión a PostgreSQL establecida');
  })
  .catch((err) => {
    console.error('Error conectando a la DB:', err.message);
  });

module.exports = pool;

