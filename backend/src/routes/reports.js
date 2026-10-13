const express = require('express');
const reportsController = require('../controllers/reportsController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);
router.use(rolePermissionMiddleware(['reportes_view']));

// ============================================
// ENDPOINTS DE RESUMEN FINANCIERO
// ============================================

// Resumen financiero general
router.get('/financial-summary', (req, res) => {
    reportsController.getFinancialSummary(req, res);
});

// Datos mensuales históricos
router.get('/monthly-data', (req, res) => {
    reportsController.getMonthlyData(req, res);
});

// Datos diarios (últimos 30 días)
router.get('/daily-data', (req, res) => {
    reportsController.getDailyData(req, res);
});

// Datos de flujo de caja
router.get('/cash-flow', (req, res) => {
    reportsController.getCashFlowData(req, res);
});

// ============================================
// ENDPOINTS DE CATEGORIZACIÓN
// ============================================

// Gastos por categoría
router.get('/expenses-by-category', (req, res) => {
    reportsController.getExpensesByCategory(req, res);
});

// Ingresos por categoría
router.get('/income-by-category', (req, res) => {
    reportsController.getIncomeByCategory(req, res);
});

// ============================================
// ENDPOINTS DE PRODUCTOS
// ============================================

// Productos más vendidos
router.get('/top-selling-products', (req, res) => {
    reportsController.getTopSellingProducts(req, res);
});

// ============================================
// ENDPOINTS DE REPORTES CONSOLIDADOS
// ============================================

// Reporte consolidado
router.get('/consolidated', (req, res) => {
    reportsController.getConsolidatedReport(req, res);
});

module.exports = router;
