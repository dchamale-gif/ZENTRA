const express = require('express');
// Si la existencia va en las dos direcciones con la web, cada movimiento se lleva a la web.
const { sincronizarTrasMovimiento } = require('../controllers/integracionesController');
const posController = require('../controllers/posController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

// El punto de venta es parte del módulo Ventas: ver para consultar, editar para vender.
const router = express.Router();
router.use(authMiddleware);
router.get('/catalogo', rolePermissionMiddleware(['pos_view']), posController.getCatalogo);
router.get('/cuentas', rolePermissionMiddleware(['pos_view']), posController.getCuentas);
router.get('/cuentas/:id', rolePermissionMiddleware(['pos_view']), posController.getCuenta);
router.post('/cuentas', rolePermissionMiddleware(['pos_create']), posController.createCuenta);
router.put('/cuentas/:id', rolePermissionMiddleware(['pos_create']), posController.renameCuenta);
router.post('/cuentas/:id/items', rolePermissionMiddleware(['pos_create']), posController.addItem);
router.put('/cuentas/:id/items/:itemId', rolePermissionMiddleware(['pos_create']), posController.changeItem);
router.delete('/cuentas/:id/items/:itemId', rolePermissionMiddleware(['pos_create']), posController.removeItem);
router.post('/cuentas/:id/cobrar', sincronizarTrasMovimiento, rolePermissionMiddleware(['pos_create']), posController.cobrarCuenta);
router.delete('/cuentas/:id', sincronizarTrasMovimiento, rolePermissionMiddleware(['pos_delete']), posController.anularCuenta);

module.exports = router;
