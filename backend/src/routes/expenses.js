const express = require('express');
const expensesController = require('../controllers/expensesController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Obtener gastos
router.get('/', rolePermissionMiddleware(['compras_view']), (req, res) => {
    expensesController.getExpenses(req, res);
});

// Resumen de gastos
router.get('/summary', rolePermissionMiddleware(['compras_view']), (req, res) => {
    expensesController.getExpensesSummary(req, res);
});

// Gastos por proveedor
router.get('/by-provider', rolePermissionMiddleware(['compras_view']), (req, res) => {
    expensesController.getExpensesByProvider(req, res);
});

module.exports = router;
