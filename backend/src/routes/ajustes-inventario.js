const express = require('express');
const ajustes = require('../controllers/ajustesInventarioController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');
const { sincronizarTrasMovimiento } = require('../controllers/integracionesController');

// Regularizaciones de inventario: ver es del módulo de artículos; registrar y anular ajustes,
// de quien puede editar artículos. Los cambios de existencia se sincronizan con la web.
const router = express.Router();
router.use(authMiddleware);
router.get('/', rolePermissionMiddleware(['inventario_view']), ajustes.listar);
router.get('/:id', rolePermissionMiddleware(['inventario_view']), ajustes.detalle);
router.post('/', sincronizarTrasMovimiento, rolePermissionMiddleware(['inventario_edit']), ajustes.crear);
router.post('/:id/anular', sincronizarTrasMovimiento, rolePermissionMiddleware(['inventario_edit']), ajustes.anular);

module.exports = router;
