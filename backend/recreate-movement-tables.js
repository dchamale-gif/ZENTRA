#!/usr/bin/env node

/**
 * Script para recrear tablas de movimientos con estructura correcta
 * Maneja la transición de VARCHAR(50) a BIGSERIAL para ids auto-generados
 */

const fs = require('fs');
const path = require('path');
const db = require('./src/db/connection');

async function recreateMovementTables() {
    console.log('🔄 Recreando tablas de movimientos con estructura correcta...\n');

    const sqlPath = path.join(__dirname, '..', 'database', 'recreate-movement-tables.sql');
    
    if (!fs.existsSync(sqlPath)) {
        console.error(`❌ Archivo no encontrado: ${sqlPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    // Split by semicolons, but respect dollar-quoted strings
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    let dollarQuoteDelim = '';

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const remaining = sql.substring(i);

        // Detectar inicio/fin de dollar quote
        if (char === '$') {
            const match = remaining.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$/);
            if (match) {
                if (inDollarQuote && match[0] === dollarQuoteDelim) {
                    inDollarQuote = false;
                    current += match[0];
                    i += match[0].length - 1;
                    continue;
                } else if (!inDollarQuote) {
                    inDollarQuote = true;
                    dollarQuoteDelim = match[0];
                    current += match[0];
                    i += match[0].length - 1;
                    continue;
                }
            }
        }

        // Procesar semicolons solo fuera de dollar quotes
        if (char === ';' && !inDollarQuote) {
            if (current.trim()) {
                statements.push(current.trim() + ';');
            }
            current = '';
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        statements.push(current.trim() + ';');
    }

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
        if (!statement.trim()) continue;

        try {
            await db.query(statement);
            const desc = statement.substring(0, 50).replace(/\n/g, ' ') + '...';
            console.log(`✅ ${desc}`);
            successCount++;
        } catch (error) {
            // Ignorar errores de "ya existe"
            if (error.message.includes('already exists')) {
                console.log(`⏭️  (ya existe)`);
                successCount++;
            } else {
                console.error(`❌ Error: ${error.message}`);
                errorCount++;
            }
        }
    }

    console.log(`\n📊 RESULTADO: ${successCount} exitosas, ${errorCount} errores`);
    
    if (errorCount === 0) {
        console.log('✅ ¡Tablas recreadas correctamente!');
        process.exit(0);
    } else {
        console.log('⚠️  Algunos comandos tuvieron errores. Revisa arriba.');
        process.exit(1);
    }
}

recreateMovementTables().catch(error => {
    console.error('Error crítico:', error);
    process.exit(1);
});
