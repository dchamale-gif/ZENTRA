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
  ssl: getDbSslConfig()
});

const executeSqlFile = async (filePath) => {
  let sql = fs.readFileSync(filePath, 'utf8');
  // Remover comandos internos de psql (líneas que inician con \)
  sql = sql.replace(/^\\[^\n]*\n?/gm, '');
  await pool.query(sql);
};

const run = async () => {
  try {
    console.log('Aplicando migración multiempresa y prueba gratuita...');
    await executeSqlFile(path.join(__dirname, '../database/multitenancy-trial-migration.sql'));
    console.log('✓ Migración multiempresa aplicada.');

    const estadoDeCuentaPath = path.join(__dirname, '../database/estado-de-cuenta-migration.sql');
    const { rows } = await pool.query("SELECT to_regclass('pacientes') AS t");
    // Tras migrar pacientes -> clientes ya no existe la tabla base de estado de cuenta
    if (fs.existsSync(estadoDeCuentaPath) && rows[0].t) {
      console.log('Aplicando migración de estado de cuenta...');
      await executeSqlFile(estadoDeCuentaPath);
      console.log('✓ Migración de estado de cuenta aplicada.');
    }

    // Migraciones de la edición sin módulo médico; todas se pueden repetir sin efecto.
    const featureMigrations = [
      'migrate-pacientes-a-clientes.sql',
      'migrate-codigos-articulos.sql',
      'compras-conceptos-migration.sql',
      'migrate-dpi-y-clasificaciones.sql',
      'integracion-ventas-compras.sql'
    ];
    for (const file of featureMigrations) {
      console.log(`Aplicando ${file}...`);
      await executeSqlFile(path.join(__dirname, '../database', file));
    }
    console.log('✓ Migraciones de clientes, artículos, compras y clasificaciones aplicadas.');

    console.log('Verificando aislamiento de datos (RLS) en todas las tablas empresariales...');
    await executeSqlFile(path.join(__dirname, '../database/verify-tenant-isolation.sql'));
    console.log('✓ Aislamiento multiempresa y RLS verificado exitosamente.');
  } catch (error) {
    console.error('❌ Error crítico en migraciones o verificación de aislamiento:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
