const express = require('express');
const felController = require('../controllers/felController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Soporte habilita FEL por empresa. Configurar es del administrador; emitir y anular, de quien
// vende. Las facturas ya emitidas se pueden consultar aunque FEL se deshabilite después.
const router = express.Router();
const habilitada = felController.requireHabilitada;
router.use(authMiddleware);
router.get('/config', habilitada, rolePermissionMiddleware(['admin_config']), felController.getConfig);
router.put('/config', habilitada, rolePermissionMiddleware(['admin_config']), felController.saveConfig);
router.get('/estado', rolePermissionMiddleware(['ventas_view']), felController.getEstado);
router.post('/ventas/:ventaId/factura', habilitada, rolePermissionMiddleware(['ventas_create']), felController.emitir);
router.post('/documentos/:id/anular', habilitada, rolePermissionMiddleware(['ventas_delete']), felController.anular);
router.get('/documentos/:id/xml', rolePermissionMiddleware(['ventas_view']), felController.getXml);

module.exports = router;
