const express = require('express');
const controller = require('../controllers/clasificacionesController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', rolePermissionMiddleware(['inventario_view']), controller.getClasificaciones);
router.post('/', rolePermissionMiddleware(['inventario_create']), controller.createClasificacion);
router.delete('/:id', rolePermissionMiddleware(['inventario_delete']), controller.deleteClasificacion);

module.exports = router;
