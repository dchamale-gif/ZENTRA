const express = require('express');
const comprasController = require('../controllers/comprasController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.get('/', rolePermissionMiddleware(['compras_view']), comprasController.getCompras);
router.get('/:id', rolePermissionMiddleware(['compras_view']), comprasController.getCompraById);
router.post('/', rolePermissionMiddleware(['compras_create']), comprasController.createCompra);
router.put('/:id', rolePermissionMiddleware(['compras_edit']), comprasController.updateCompra);
router.delete('/:id', rolePermissionMiddleware(['compras_delete']), comprasController.deleteCompra);

module.exports = router;