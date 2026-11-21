const express = require('express');
const { rateLimit } = require('express-rate-limit');
const integracionesController = require('../controllers/integracionesController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

// Las llama el servidor de la página web con su llave (sin sesión de usuario): van antes de
// authMiddleware. Con «El ERP manda», cada pedido de la web es una venta del ERP.
const pedidosLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados pedidos en un minuto; intenta de nuevo en un momento' }
});
router.post('/web/pedidos', pedidosLimiter, integracionesController.autenticarWeb, integracionesController.registrarPedidoWeb);
router.post('/web/pedidos/:referencia/anular', pedidosLimiter, integracionesController.autenticarWeb, integracionesController.anularPedidoWeb);

// Configurar la conexión es solo del administrador de la empresa. Sincronizar lo pide
// también el punto de venta al abrirse (auto) y quien edita artículos.
router.use(authMiddleware);
router.get('/web', rolePermissionMiddleware(['admin_config']), integracionesController.getConfig);
router.put('/web', rolePermissionMiddleware(['admin_config']), integracionesController.saveConfig);
router.delete('/web', rolePermissionMiddleware(['admin_config']), integracionesController.deleteConfig);
router.post('/web/probar', rolePermissionMiddleware(['admin_config']), integracionesController.probar);
router.post('/web/llave', rolePermissionMiddleware(['admin_config']), integracionesController.generarLlave);
router.delete('/web/llave', rolePermissionMiddleware(['admin_config']), integracionesController.revocarLlave);
router.post('/web/sincronizar', rolePermissionMiddleware(['admin_config', 'inventario_view', 'ventas_view', 'pos_view']), integracionesController.sincronizar);

module.exports = router;
