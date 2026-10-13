const express = require('express');
const ventasController = require('../controllers/ventasController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);
router.get('/', rolePermissionMiddleware(['ventas_view']), ventasController.getVentas);
router.get('/receptores', rolePermissionMiddleware(['ventas_view']), ventasController.getReceptores);
router.post('/', rolePermissionMiddleware(['ventas_create']), ventasController.createVenta);
router.put('/:id', rolePermissionMiddleware(['ventas_edit']), ventasController.updateVenta);
router.delete('/:id', rolePermissionMiddleware(['ventas_delete']), ventasController.deleteVenta);

module.exports = router;