const express = require('express');
const cierres = require('../controllers/cierresCajaController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Cierre de caja: cada cajera ve lo suyo; revisar y aprobar cierres, del administrador o de
// quien tenga el módulo «Cierre de caja».
const router = express.Router();
router.use(authMiddleware);
router.get('/mi-caja', rolePermissionMiddleware(['pos_view', 'ventas_view', 'cobros_view', 'caja_view']), cierres.miCaja);
router.get('/pendientes', rolePermissionMiddleware(['admin_config', 'cierres_view']), cierres.pendientes);
router.get('/', rolePermissionMiddleware(['admin_config', 'cierres_view']), cierres.listar);
router.post('/', rolePermissionMiddleware(['admin_config', 'cierres_edit']), cierres.aprobar);

module.exports = router;
