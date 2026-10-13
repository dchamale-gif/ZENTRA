const express = require('express');
const { getNotifications } = require('../controllers/notificationsController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, getNotifications);

module.exports = router;
