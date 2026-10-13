const express = require('express');
const cajaController = require('../controllers/cajaController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', rolePermissionMiddleware(['caja_view']), (req, res) => cajaController.getMovimientos(req, res));
router.get('/summary', rolePermissionMiddleware(['caja_view']), (req, res) => cajaController.getResumen(req, res));
router.post('/', rolePermissionMiddleware(['caja_edit']), (req, res) => cajaController.createMovimiento(req, res));
router.put('/:id', rolePermissionMiddleware(['caja_edit']), (req, res) => cajaController.updateMovimiento(req, res));

module.exports = router;