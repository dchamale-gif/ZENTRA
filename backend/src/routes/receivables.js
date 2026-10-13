const express = require('express');
const receivablesController = require('../controllers/receivablesController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Obtener cuentas por cobrar
router.get('/', rolePermissionMiddleware(['cobros_view']), (req, res) => {
    receivablesController.getReceivables(req, res);
});

// Resumen de cuentas por cobrar
router.get('/summary', rolePermissionMiddleware(['cobros_view']), (req, res) => {
    receivablesController.getReceivablesSummary(req, res);
});

// Estado de cuenta por cliente
router.get('/statement/:cliente_id', rolePermissionMiddleware(['cobros_view']), (req, res) => {
    receivablesController.getClientStatement(req, res);
});

// Movimientos de una cuenta
router.get('/:venta_id/movements', rolePermissionMiddleware(['cobros_view']), (req, res) => {
    receivablesController.getReceivableMovements(req, res);
});

// Registrar pago
router.post('/:venta_id/payment', rolePermissionMiddleware(['cobros_create']), (req, res) => {
    receivablesController.recordPayment(req, res);
});

module.exports = router;
