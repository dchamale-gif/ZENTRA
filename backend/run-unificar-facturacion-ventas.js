#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { getDbSslConfig } = require('./src/db/sslConfig');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'zentra',
  ssl: getDbSslConfig(),
});

async function run() {
  const migrationPath = path.join(__dirname, '../database/unificar-facturacion-ventas.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query(sql);
    console.log('Migración de facturación y ventas aplicada correctamente.');
  } catch (error) {
    console.error(`No se pudo aplicar la migración: ${error.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();