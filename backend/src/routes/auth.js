const express = require('express');
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Rutas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/verificar-correo', authController.verifyEmail);
router.get('/sitio', authController.sitio);
// Llega desde otra dirección (formulario): trae la sesión a esta.
router.post('/traspaso', authController.traspaso);

// Rutas protegidas
router.post('/logout', authController.logout);
router.post('/salir-soporte', authController.salirDeSoporte);
router.get('/sesion', authController.sesionActual, authMiddleware, authController.getProfile);
router.get('/profile', authMiddleware, authController.getProfile);
router.post('/change-password', authMiddleware, authController.changePassword);

module.exports = router;
