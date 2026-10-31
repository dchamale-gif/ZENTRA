const express = require('express');
// Si la existencia va en las dos direcciones con la web, cada movimiento se lleva a la web.
const { sincronizarTrasMovimiento } = require('../controllers/integracionesController');
const comprasController = require('../controllers/comprasController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.get('/', rolePermissionMiddleware(['compras_view']), comprasController.getCompras);
router.get('/:id', rolePermissionMiddleware(['compras_view']), comprasController.getCompraById);
router.post('/', sincronizarTrasMovimiento, rolePermissionMiddleware(['compras_create']), comprasController.createCompra);
router.put('/:id', sincronizarTrasMovimiento, rolePermissionMiddleware(['compras_edit']), comprasController.updateCompra);
router.delete('/:id', sincronizarTrasMovimiento, rolePermissionMiddleware(['compras_delete']), comprasController.deleteCompra);

module.exports = router;