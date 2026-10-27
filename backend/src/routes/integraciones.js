const express = require('express');
const integracionesController = require('../controllers/integracionesController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Configurar la conexión es solo del administrador de la empresa. Sincronizar lo pide
// también el punto de venta al abrirse (auto) y quien edita artículos.
const router = express.Router();
router.use(authMiddleware);
router.get('/web', rolePermissionMiddleware(['admin_config']), integracionesController.getConfig);
router.put('/web', rolePermissionMiddleware(['admin_config']), integracionesController.saveConfig);
router.delete('/web', rolePermissionMiddleware(['admin_config']), integracionesController.deleteConfig);
router.post('/web/probar', rolePermissionMiddleware(['admin_config']), integracionesController.probar);
router.post('/web/sincronizar', rolePermissionMiddleware(['admin_config', 'inventario_view', 'ventas_view']), integracionesController.sincronizar);

module.exports = router;
