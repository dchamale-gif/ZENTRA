const express = require('express');
const preciosController = require('../controllers/preciosController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Precios con margen de beneficio: ver es del módulo de artículos; cambiar márgenes y
// publicar precios, de quien puede editar artículos.
const router = express.Router();
router.use(authMiddleware);
router.get('/', rolePermissionMiddleware(['inventario_view']), preciosController.listar);
router.get('/config', rolePermissionMiddleware(['inventario_view']), preciosController.obtenerConfig);
router.put('/config', rolePermissionMiddleware(['inventario_edit']), preciosController.guardarConfig);
router.put('/margen', rolePermissionMiddleware(['inventario_edit']), preciosController.asignarMargen);
router.post('/publicar', rolePermissionMiddleware(['inventario_edit']), preciosController.publicar);

module.exports = router;
