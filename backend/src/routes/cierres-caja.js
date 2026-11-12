const express = require('express');
const cierres = require('../controllers/cierresCajaController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Cierre de caja en dos pasos: cada cajera ve lo suyo; quien tiene «Cierre de caja» cuenta y
// registra el cierre; el administrador o quien tenga «Aprobar cierres y depósitos» lo aprueba.
const VER = ['admin_config', 'cierres_view', 'aprobaciones_view'];
const APROBAR = ['admin_config', 'aprobaciones_edit'];
const router = express.Router();
router.use(authMiddleware);
router.get('/mi-caja', rolePermissionMiddleware(['pos_view', 'ventas_view', 'cobros_view', 'caja_view']), cierres.miCaja);
router.get('/pendientes', rolePermissionMiddleware(VER), cierres.pendientes);
router.get('/', rolePermissionMiddleware(VER), cierres.listar);
router.post('/', rolePermissionMiddleware(['admin_config', 'cierres_edit']), cierres.registrar);
router.post('/:id/aprobar', rolePermissionMiddleware(APROBAR), cierres.aprobar);
router.post('/:id/rechazar', rolePermissionMiddleware(APROBAR), cierres.rechazar);

module.exports = router;
