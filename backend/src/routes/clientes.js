const express = require('express');
const clientesController = require('../controllers/clientesController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', rolePermissionMiddleware(['clientes_view']), clientesController.getClientes);
router.post('/import', rolePermissionMiddleware(['clientes_create']), clientesController.importClientes);
router.get('/:id', rolePermissionMiddleware(['clientes_view']), clientesController.getClienteById);
router.post('/', rolePermissionMiddleware(['clientes_create']), clientesController.createCliente);
router.put('/:id', rolePermissionMiddleware(['clientes_edit']), clientesController.updateCliente);
router.delete('/:id', rolePermissionMiddleware(['clientes_delete']), clientesController.deleteCliente);

module.exports = router;
