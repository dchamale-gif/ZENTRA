const express = require('express');
const cierres = require('../controllers/cierresCajaController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Cierre de caja: cada cajera ve lo suyo; revisar y aprobar cierres es del administrador.
const router = express.Router();
router.use(authMiddleware);
router.get('/mi-caja', rolePermissionMiddleware(['ventas_view', 'cobros_view', 'caja_view']), cierres.miCaja);
router.get('/pendientes', rolePermissionMiddleware(['admin_config']), cierres.pendientes);
router.get('/', rolePermissionMiddleware(['admin_config']), cierres.listar);
router.post('/', rolePermissionMiddleware(['admin_config']), cierres.aprobar);

module.exports = router;
