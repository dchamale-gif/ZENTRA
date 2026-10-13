const express = require('express');
const codigosArticulosController = require('../controllers/codigosArticulosController');
const importController = require('../controllers/importController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// POST - Importación masiva (filas JSON desde Excel)
router.post('/import', rolePermissionMiddleware(['inventario_create']), importController.importArticulos);

// GET - Stock bajo (PRIMERO - evitar conflicto con :id)
router.get('/stock/bajo', rolePermissionMiddleware(['inventario_view']), codigosArticulosController.getArticulosStockBajo);

// GET - Previsualizar siguiente código interno
router.get('/siguiente-codigo', rolePermissionMiddleware(['inventario_view']), codigosArticulosController.getSiguienteCodigo);

// GET - Listar artículos
router.get('/', rolePermissionMiddleware(['inventario_view']), codigosArticulosController.getArticulos);

// GET - Obtener artículo específico
router.get('/:id', rolePermissionMiddleware(['inventario_view']), codigosArticulosController.getArticuloById);

// POST - Crear artículo
router.post('/', rolePermissionMiddleware(['inventario_create']), codigosArticulosController.createArticulo);

// PUT - Actualizar artículo
router.put('/:id', rolePermissionMiddleware(['inventario_edit']), codigosArticulosController.updateArticulo);

// PUT - Actualizar cantidad
router.put('/:id/cantidad', rolePermissionMiddleware(['inventario_edit']), codigosArticulosController.actualizarCantidad);

// DELETE - Eliminar artículo
router.delete('/:id', rolePermissionMiddleware(['inventario_delete']), codigosArticulosController.deleteArticulo);

module.exports = router;
