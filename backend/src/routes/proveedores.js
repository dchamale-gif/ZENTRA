const express = require('express');
const proveedoresController = require('../controllers/proveedoresController');
const importController = require('../controllers/importController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// POST - Importación masiva (filas JSON desde Excel)
router.post('/import', rolePermissionMiddleware(['proveedores_create']), importController.importProveedores);

// GET - Listar proveedores
router.get('/', rolePermissionMiddleware(['proveedores_view', 'compras_view']), proveedoresController.getProveedores);

// GET - Obtener proveedor específico
router.get('/:id', rolePermissionMiddleware(['proveedores_view']), proveedoresController.getProveedorById);

// POST - Crear proveedor
router.post('/', rolePermissionMiddleware(['proveedores_create', 'compras_create']), proveedoresController.createProveedor);

// PUT - Actualizar proveedor
router.put('/:id', rolePermissionMiddleware(['proveedores_edit']), proveedoresController.updateProveedor);

// DELETE - Eliminar proveedor
router.delete('/:id', rolePermissionMiddleware(['proveedores_delete']), proveedoresController.deleteProveedor);

module.exports = router;
