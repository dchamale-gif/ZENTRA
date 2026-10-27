const express = require('express');
const felController = require('../controllers/felController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Configurar la facturación es del administrador; emitir y anular, de quien vende.
const router = express.Router();
router.use(authMiddleware);
router.get('/config', rolePermissionMiddleware(['admin_config']), felController.getConfig);
router.put('/config', rolePermissionMiddleware(['admin_config']), felController.saveConfig);
router.get('/estado', rolePermissionMiddleware(['ventas_view']), felController.getEstado);
router.post('/ventas/:ventaId/factura', rolePermissionMiddleware(['ventas_create']), felController.emitir);
router.post('/documentos/:id/anular', rolePermissionMiddleware(['ventas_delete']), felController.anular);
router.get('/documentos/:id/xml', rolePermissionMiddleware(['ventas_view']), felController.getXml);

module.exports = router;
