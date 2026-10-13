const { Pool } = require('pg');
const { getDbSslConfig } = require('./sslConfig');

const authPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.AUTH_DB_USER || process.env.DB_USER,
  password: process.env.AUTH_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'zentra',
  ssl: getDbSslConfig()
});

module.exports = authPool;
