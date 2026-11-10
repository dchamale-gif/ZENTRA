const express = require('express');
const preciosController = require('../controllers/preciosController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// Precios con margen de beneficio: módulo propio (Precios); ver la lista, o cambiar márgenes y
// publicar precios con nivel de edición.
const router = express.Router();
router.use(authMiddleware);
router.get('/', rolePermissionMiddleware(['precios_view']), preciosController.listar);
router.get('/config', rolePermissionMiddleware(['precios_view']), preciosController.obtenerConfig);
router.put('/config', rolePermissionMiddleware(['precios_edit']), preciosController.guardarConfig);
router.put('/margen', rolePermissionMiddleware(['precios_edit']), preciosController.asignarMargen);
router.post('/publicar', rolePermissionMiddleware(['precios_edit']), preciosController.publicar);

module.exports = router;
