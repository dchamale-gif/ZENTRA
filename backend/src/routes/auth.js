const express = require('express');
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Rutas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/verificar-correo', authController.verifyEmail);

// Rutas protegidas
router.post('/logout', authController.logout);
router.get('/profile', authMiddleware, authController.getProfile);
router.post('/change-password', authMiddleware, authController.changePassword);

module.exports = router;
