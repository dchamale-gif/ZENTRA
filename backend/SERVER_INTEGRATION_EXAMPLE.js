// ============================================
// EJEMPLO DE INTEGRACIÓN EN server.js
// ============================================

/**
 * ARCHIVO: backend/server.js
 * 
 * Agregar las siguientes líneas para integrar el módulo de facturación mejorada
 */

// ============================================
// IMPORTACIONES EXISTENTES
// ============================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Importar middleware
const { verifyToken } = require('./src/middleware/auth');
const auditMiddleware = require('./src/middleware/audit');

// Importar rutas EXISTENTES
const authRoutes = require('./src/routes/auth');
const pacientesRoutes = require('./src/routes/pacientes');
const medicinasRoutes = require('./src/routes/medicinas');
const billingRoutes = require('./src/routes/billing');

// ============================================
// IMPORTAR NUEVAS RUTAS DE FACTURACIÓN MEJORADA
// ============================================
// *** AGREGAR ESTA LÍNEA ***
const billingMejoradaRoutes = require('./src/routes/billing-mejorada');

// ============================================
// CREAR APLICACIÓN EXPRESS
// ============================================

const app = express();

// Middleware de seguridad
app.use(helmet());

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Audit
app.use(auditMiddleware);

// ============================================
// RUTAS PÚBLICAS
// ============================================

app.use('/api/auth', authRoutes);

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================

app.use(verifyToken);

// ============================================
// RUTAS PROTEGIDAS - EXISTENTES
// ============================================

app.use('/api/pacientes', pacientesRoutes);
app.use('/api/medicinas', medicinasRoutes);
app.use('/api/billing', billingRoutes);

// ============================================
// RUTAS PROTEGIDAS - FACTURACIÓN MEJORADA
// ============================================
// *** AGREGAR ESTAS LÍNEAS ***
app.use('/api/billing', billingMejoradaRoutes);
app.use('/api/saldo-paciente', billingMejoradaRoutes);

// ============================================
// RUTAS ESTÁTICAS (Opcional)
// ============================================

app.use(express.static('../')); // Servir archivos estáticos

// ============================================
// MANEJO DE ERRORES
// ============================================

app.use((err, req, res, next) => {
    console.error('Error:', err);

    const status = err.status || 500;
    const message = err.message || 'Error interno del servidor';

    res.status(status).json({
        success: false,
        message: message,
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3011;

const server = app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║  SISTEMA CONTABLE - Servidor Ejecutándose
    ║  Puerto: ${PORT}
    ║  Ambiente: ${process.env.NODE_ENV || 'development'}
    ║
    ║  Rutas disponibles:
    ║  - POST   /api/auth/login
    ║  - GET    /api/pacientes
    ║  - GET    /api/medicinas
    ║  - POST   /api/billing/facturas-mejorada ✨ NUEVO
    ║  - GET    /api/billing/facturas
    ║  - GET    /api/billing/estado-cuenta/:id ✨ NUEVO
    ║  - GET    /api/saldo-paciente/:id ✨ NUEVO
    ║  - POST   /api/billing/pagos ✨ NUEVO
    ║
    ╚════════════════════════════════════════╝
    `);
});

// Manejo de cierre de servidor
process.on('SIGTERM', () => {
    console.log('Señal SIGTERM recibida. Cerrando servidor...');
    server.close(() => {
        console.log('Servidor cerrado');
        process.exit(0);
    });
});

module.exports = app;
