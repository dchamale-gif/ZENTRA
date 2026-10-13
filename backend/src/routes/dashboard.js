const express = require('express');
const { getDashboard, getTransactions } = require('../controllers/dashboardController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, getDashboard);
router.get('/transactions', authMiddleware, getTransactions);

module.exports = router;
