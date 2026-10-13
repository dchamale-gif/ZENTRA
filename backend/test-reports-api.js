#!/usr/bin/env node

/**
 * Script de prueba para verificar que los endpoints de reportes están funcionando
 * 
 * Uso: node test-reports-api.js [baseURL] [token]
 * Ejemplo: node test-reports-api.js http://localhost:3011 tu-token-aqui
 */

const http = require('http');
const https = require('https');

// Configuración
const baseURL = process.argv[2] || 'http://localhost:3011';
const authToken = process.argv[3] || 'test-token';

// Endpoints a probar
const endpoints = [
    {
        name: 'Resumen Financiero',
        path: '/api/reports/financial-summary',
        query: ''
    },
    {
        name: 'Datos Mensuales',
        path: '/api/reports/monthly-data',
        query: '?months=12'
    },
    {
        name: 'Datos Diarios',
        path: '/api/reports/daily-data',
        query: ''
    },
    {
        name: 'Gastos por Categoría',
        path: '/api/reports/expenses-by-category',
        query: ''
    },
    {
        name: 'Ingresos por Categoría',
        path: '/api/reports/income-by-category',
        query: ''
    },
    {
        name: 'Flujo de Caja',
        path: '/api/reports/cash-flow',
        query: '?months=12'
    },
    {
        name: 'Productos Más Vendidos',
        path: '/api/reports/top-selling-products',
        query: '?limit=10'
    },
    {
        name: 'Health Check',
        path: '/health',
        query: ''
    }
];

// Función para hacer peticiones HTTP
function makeRequest(url, token) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        protocol.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        }).on('error', reject);
    });
}

// Función principal de prueba
async function runTests() {
    console.log(`\n🧪 Probando endpoints de reportes\n`);
    console.log(`📡 Base URL: ${baseURL}\n`);
    console.log(`${'─'.repeat(70)}\n`);

    let passed = 0;
    let failed = 0;

    for (const endpoint of endpoints) {
        try {
            const fullURL = `${baseURL}${endpoint.path}${endpoint.query}`;
            console.log(`⏳ Probando: ${endpoint.name}`);
            console.log(`   Endpoint: ${endpoint.path}${endpoint.query}`);

            const result = await makeRequest(fullURL, authToken);

            if (result.status === 200) {
                console.log(`✅ OK - Status: ${result.status}`);
                if (result.data.success !== undefined) {
                    console.log(`   Success: ${result.data.success}`);
                }
                if (result.data.data) {
                    console.log(`   Datos: ${JSON.stringify(result.data.data).substring(0, 100)}...`);
                }
                passed++;
            } else if (result.status === 401) {
                console.log(`⚠️  Sin autorización - Status: ${result.status}`);
                console.log(`   Usa: node test-reports-api.js ${baseURL} [token-valido]`);
                failed++;
            } else {
                console.log(`❌ Error - Status: ${result.status}`);
                if (result.data.error) {
                    console.log(`   Error: ${result.data.error}`);
                }
                failed++;
            }
        } catch (error) {
            console.log(`❌ Error de conexión: ${error.message}`);
            failed++;
        }
        console.log(`${'─'.repeat(70)}`);
    }

    console.log(`\n📊 Resultados:`);
    console.log(`✅ Exitosos: ${passed}`);
    console.log(`❌ Fallidos: ${failed}`);
    console.log(`📈 Total: ${passed + failed}\n`);

    if (failed === 0 && passed > 0) {
        console.log(`🎉 ¡Todos los endpoints funcionan correctamente!\n`);
    } else if (failed > 0) {
        console.log(`⚠️  Algunos endpoints tuvieron problemas. Verifica el backend.\n`);
    }
}

// Ejecutar pruebas
runTests().catch(error => {
    console.error('Error al ejecutar pruebas:', error);
    process.exit(1);
});
