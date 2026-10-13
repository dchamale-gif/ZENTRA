#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const pool = require('./src/db/platformConnection');

const run = async () => {
  const email = String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.PLATFORM_ADMIN_PASSWORD || '');
  const nombre = String(process.env.PLATFORM_ADMIN_NAME || 'Soporte Zentra').trim();

  if (!email || !password || password.length < 12) {
    throw new Error('Defina PLATFORM_ADMIN_EMAIL y una PLATFORM_ADMIN_PASSWORD de al menos 12 caracteres');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO platform_admins (email, password_hash, nombre)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         nombre = EXCLUDED.nombre,
         activo = true,
         updated_at = NOW()`,
    [email, passwordHash, nombre]
  );
  console.log(`Administrador de soporte creado/actualizado: ${email}`);
};

run()
  .catch((error) => {
    console.error('Error creando administrador de soporte:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
