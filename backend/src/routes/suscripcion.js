const express = require('express');
const suscripcion = require('../controllers/suscripcionController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Suscripción a BotEngine: solo el administrador de la empresa elige la forma de pago,
// ve las facturas y sube los comprobantes.
const router = express.Router();
router.use(authMiddleware, rolePermissionMiddleware(['admin_config']));
router.get('/', suscripcion.resumen);
router.put('/forma-pago', suscripcion.elegirFormaPago);
router.get('/facturas/:id/pdf', suscripcion.pdfFactura);
router.post('/facturas/:id/comprobantes', suscripcion.subirComprobante);
router.get('/comprobantes/:id', suscripcion.verComprobante);

module.exports = router;
