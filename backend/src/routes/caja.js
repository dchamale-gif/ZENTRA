const express = require('express');
const cajaController = require('../controllers/cajaController');
const depositos = require('../controllers/depositosCajaController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Depósitos al banco: los registra quien maneja la caja y los confirma un administrador.
router.get('/depositos', rolePermissionMiddleware(['caja_view']), depositos.listar);
router.get('/depositos/:id/boleta', rolePermissionMiddleware(['caja_view']), depositos.verBoleta);
router.post('/depositos', rolePermissionMiddleware(['caja_edit']), depositos.registrar);
router.post('/depositos/:id/confirmar', rolePermissionMiddleware(['admin_config', 'cierres_edit']), depositos.confirmar);
router.post('/depositos/:id/rechazar', rolePermissionMiddleware(['admin_config', 'cierres_edit']), depositos.rechazar);

router.get('/', rolePermissionMiddleware(['caja_view']), (req, res) => cajaController.getMovimientos(req, res));
router.get('/summary', rolePermissionMiddleware(['caja_view']), (req, res) => cajaController.getResumen(req, res));
router.post('/', rolePermissionMiddleware(['caja_edit']), (req, res) => cajaController.createMovimiento(req, res));
router.put('/:id', rolePermissionMiddleware(['caja_edit']), (req, res) => cajaController.updateMovimiento(req, res));
router.delete('/:id', rolePermissionMiddleware(['caja_edit']), (req, res) => cajaController.anularMovimiento(req, res));

module.exports = router;