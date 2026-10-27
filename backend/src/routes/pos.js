const express = require('express');
const posController = require('../controllers/posController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// El punto de venta es parte del módulo Ventas: ver para consultar, editar para vender.
const router = express.Router();
router.use(authMiddleware);
router.get('/catalogo', rolePermissionMiddleware(['ventas_view']), posController.getCatalogo);
router.get('/cuentas', rolePermissionMiddleware(['ventas_view']), posController.getCuentas);
router.get('/cuentas/:id', rolePermissionMiddleware(['ventas_view']), posController.getCuenta);
router.post('/cuentas', rolePermissionMiddleware(['ventas_create']), posController.createCuenta);
router.put('/cuentas/:id', rolePermissionMiddleware(['ventas_create']), posController.renameCuenta);
router.post('/cuentas/:id/items', rolePermissionMiddleware(['ventas_create']), posController.addItem);
router.put('/cuentas/:id/items/:itemId', rolePermissionMiddleware(['ventas_create']), posController.changeItem);
router.delete('/cuentas/:id/items/:itemId', rolePermissionMiddleware(['ventas_create']), posController.removeItem);
router.post('/cuentas/:id/cobrar', rolePermissionMiddleware(['ventas_create']), posController.cobrarCuenta);
router.delete('/cuentas/:id', rolePermissionMiddleware(['ventas_delete']), posController.anularCuenta);

module.exports = router;
