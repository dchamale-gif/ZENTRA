#!/usr/bin/env node

/**
 * SCRIPT PARA CREAR USUARIO DE PRUEBA EN LA BASE DE DATOS
 * Uso: node create-test-user.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/db/connection');

const TEST_EMAIL = 'admin@zentra.com';
const TEST_PASSWORD = 'admin123';
const TEST_NAME = 'Admin';
const TEST_LASTNAME = 'Usuario';

async function createTestUser() {
    console.log('🔐 Creando usuario de prueba...\n');

    try {
        // 1. Verificar conexión a BD
        console.log('📡 Conectando a la base de datos...');
        const connTest = await pool.query('SELECT NOW()');
        console.log('✅ Conexión exitosa\n');

        // 2. Crear roles si no existen
        console.log('📋 Creando roles...');
        await pool.query(`
            INSERT INTO roles (nombre, descripcion) VALUES 
              ('admin', 'Administrador del sistema'),
              ('doctor', 'Doctor'),
              ('recepcionista', 'Recepcionista'),
              ('contable', 'Contable'),
              ('paciente', 'Paciente')
            ON CONFLICT (nombre) DO NOTHING
        `);
        console.log('✅ Roles creados/verificados\n');

        // 3. Verificar si usuario ya existe
        console.log(`🔍 Verificando si ${TEST_EMAIL} ya existe...`);
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [TEST_EMAIL]
        );

        if (existing.rows.length > 0) {
            console.log(`⚠️  El usuario ${TEST_EMAIL} ya existe`);
            const user = existing.rows[0];
            console.log(`ID: ${user.id}\n`);

            // Preguntar si quiere actualizar contraseña
            console.log('💡 Para actualizar la contraseña, ejecutar:');
            console.log(`   UPDATE users SET password_hash = '$2a$10$...' WHERE email = '${TEST_EMAIL}';`);
            return;
        }

        // 4. Hash de contraseña
        console.log('🔐 Generando hash de contraseña...');
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        console.log(`✅ Hash generado: ${hashedPassword}\n`);

        // 5. Insertar usuario
        console.log(`👤 Creando usuario ${TEST_EMAIL}...`);
        const userResult = await pool.query(
            `INSERT INTO users (email, password_hash, nombre, apellido, telefono, activo, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
             RETURNING id, email, nombre, apellido`,
            [TEST_EMAIL, hashedPassword, TEST_NAME, TEST_LASTNAME, '+502-1234-5678']
        );

        const user = userResult.rows[0];
        console.log(`✅ Usuario creado:
   ID: ${user.id}
   Email: ${user.email}
   Nombre: ${user.nombre} ${user.apellido}\n`);

        // 6. Asignar rol admin
        console.log('👑 Asignando rol admin...');
        await pool.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1, (SELECT id FROM roles WHERE nombre = 'admin'))
             ON CONFLICT DO NOTHING`,
            [user.id]
        );
        console.log('✅ Rol asignado\n');

        // 7. Mostrar información de acceso
        console.log('═══════════════════════════════════════════');
        console.log('✅ USUARIO DE PRUEBA CREADO EXITOSAMENTE');
        console.log('═══════════════════════════════════════════\n');
        console.log('📧 Credenciales de acceso:\n');
        console.log(`   Email:      ${TEST_EMAIL}`);
        console.log(`   Contraseña: ${TEST_PASSWORD}\n`);
        console.log('🌐 Acceder a: http://localhost:5500/login.html\n');
        console.log('═══════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Ejecutar
createTestUser();
