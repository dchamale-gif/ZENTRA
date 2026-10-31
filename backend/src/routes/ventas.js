const express = require('express');
// Si la existencia va en las dos direcciones con la web, cada movimiento se lleva a la web.
const { sincronizarTrasMovimiento } = require('../controllers/integracionesController');
const clientesController = require('../controllers/clientesController');
const ventasController = require('../controllers/ventasController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);
router.get('/', rolePermissionMiddleware(['ventas_view']), ventasController.getVentas);
router.get('/receptores', rolePermissionMiddleware(['ventas_view']), ventasController.getReceptores);
router.post('/receptores', rolePermissionMiddleware(['ventas_create']), clientesController.createCliente);
router.post('/', sincronizarTrasMovimiento, rolePermissionMiddleware(['ventas_create']), ventasController.createVenta);
router.put('/:id', sincronizarTrasMovimiento, rolePermissionMiddleware(['ventas_edit']), ventasController.updateVenta);
router.delete('/:id', sincronizarTrasMovimiento, rolePermissionMiddleware(['ventas_delete']), ventasController.deleteVenta);

module.exports = router;