require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

// Importar rutas
const authRoutes = require('./src/routes/auth');
const platformRoutes = require('./src/routes/platform');
const proveedoresRoutes = require('./src/routes/proveedores');
const clasificacionesRoutes = require('./src/routes/clasificaciones');
const codigosArticulosRoutes = require('./src/routes/codigos-articulos');
const reportsRoutes = require('./src/routes/reports');
const expensesRoutes = require('./src/routes/expenses');
const receivablesRoutes = require('./src/routes/receivables');
const comprasRoutes = require('./src/routes/compras');
const ventasRoutes = require('./src/routes/ventas');
const posRoutes = require('./src/routes/pos');
const integracionesRoutes = require('./src/routes/integraciones');
const felRoutes = require('./src/routes/fel');
const cajaRoutes = require('./src/routes/caja');
const clientesRoutes = require('./src/routes/clientes');
const notificationsRoutes = require('./src/routes/notifications');
const dashboardRoutes = require('./src/routes/dashboard');
const usersRoutes = require('./src/routes/users');

// Importar middleware
const { auditMiddleware } = require('./src/middleware/audit');
const pool = require('./src/db/connection');
const authPool = require('./src/db/authConnection');
const platformPool = require('./src/db/platformConnection');

const app = express();
const PORT = process.env.PORT || 3011;
// Número de proxies delante del backend: 1 con Caddy solo, 2 si nginx va delante de Caddy.
app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// ====================================
// MIDDLEWARE GLOBALES
// ====================================

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' }
}));

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(Boolean);
if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('CORS_ORIGIN es obligatorio en producción');
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      return callback(null, true);
    }
    callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser. La importación de artículos admite más porque cada fila puede traer su foto en base64.
app.use('/api/codigos-articulos/import', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta nuevamente en 15 minutos.' }
});

// Logging de solicitudes
app.use(morgan('combined'));

// Auditoría
app.use(auditMiddleware);

// ====================================
// RUTAS DE API
// ====================================

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    protocol: req.protocol.toUpperCase()
  });
});

// Autenticación
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use('/api/auth/change-password', authRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/platform', platformRoutes);



// Códigos/Artículos
app.use('/api/codigos-articulos', codigosArticulosRoutes);
app.use('/api/clasificaciones', clasificacionesRoutes);

// Proveedores
app.use('/api/proveedores', proveedoresRoutes);

// Compras y conceptos
app.use('/api/compras', comprasRoutes);

// Ventas e inventario
app.use('/api/ventas', ventasRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/integraciones', integracionesRoutes);
app.use('/api/fel', felRoutes);






// Gastos y servicios
app.use('/api/expenses', expensesRoutes);

// Cuentas por cobrar
app.use('/api/receivables', receivablesRoutes);

// Movimientos de caja
app.use('/api/caja', cajaRoutes);

// Clientes
app.use('/api/clientes', clientesRoutes);

// Notificaciones
app.use('/api/notifications', notificationsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', usersRoutes);


// Lugar de Trabajo

// Contactos de Emergencia







// Reportes y Dashboards
app.use('/api/reports', reportsRoutes);

// ====================================
// MANEJO DE ERRORES
// ====================================

// 404 - No encontrado
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method
  });
});

// Error global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ====================================
// INICIAR SERVIDOR
// ====================================

const startServer = async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }
  const pools = [
    ['tenant', pool],
    ['autenticación', authPool],
    ['plataforma', platformPool]
  ];
  const roles = [];
  for (const [purpose, databasePool] of pools) {
    const result = await databasePool.query(
      `SELECT rolname, rolsuper, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`
    );
    const role = result.rows[0];
    roles.push(role?.rolname);
    if (process.env.NODE_ENV === 'production' && (role?.rolsuper || role?.rolbypassrls)) {
      throw new Error(`El rol PostgreSQL de ${purpose} puede omitir RLS`);
    }
  }
  if (process.env.NODE_ENV === 'production' && new Set(roles).size !== roles.length) {
    throw new Error('Los roles PostgreSQL de tenant, autenticación y plataforma deben ser distintos');
  }

  app.listen(PORT, () => {
    console.log(`Zentra API disponible en http://0.0.0.0:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('No se pudo iniciar Zentra API:', error.message);
  process.exitCode = 1;
});

module.exports = app;
