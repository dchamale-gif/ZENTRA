const express = require('express');
// Si la existencia va en las dos direcciones con la web, cada movimiento se lleva a la web.
const { sincronizarTrasMovimiento } = require('../controllers/integracionesController');
const codigosArticulosController = require('../controllers/codigosArticulosController');
const importController = require('../controllers/importController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// POST - Importación masiva (filas JSON desde Excel)
router.post('/import', sincronizarTrasMovimiento, rolePermissionMiddleware(['inventario_create']), importController.importArticulos);

// GET - Stock bajo (PRIMERO - evitar conflicto con :id)
router.get('/stock/bajo', rolePermissionMiddleware(['inventario_view']), codigosArticulosController.getArticulosStockBajo);

// GET - Previsualizar siguiente código interno
router.get('/siguiente-codigo', rolePermissionMiddleware(['inventario_view']), codigosArticulosController.getSiguienteCodigo);

// GET - Listar artículos
router.get('/', rolePermissionMiddleware(['inventario_view', 'ventas_view', 'compras_view']), codigosArticulosController.getArticulos);

// Foto del artículo: se ve desde Artículos, Ventas, Compras y el punto de venta.
router.get('/:id/foto', rolePermissionMiddleware(['inventario_view', 'ventas_view', 'compras_view']), codigosArticulosController.getFoto);
router.put('/:id/foto', rolePermissionMiddleware(['inventario_edit']), codigosArticulosController.setFoto);
router.delete('/:id/foto', rolePermissionMiddleware(['inventario_edit']), codigosArticulosController.setFoto);

// GET - Obtener artículo específico
router.get('/:id', rolePermissionMiddleware(['inventario_view']), codigosArticulosController.getArticuloById);

// POST - Crear artículo
router.post('/', sincronizarTrasMovimiento, rolePermissionMiddleware(['inventario_create']), codigosArticulosController.createArticulo);

// PUT - Actualizar artículo
router.put('/:id', sincronizarTrasMovimiento, rolePermissionMiddleware(['inventario_edit']), codigosArticulosController.updateArticulo);

// PUT - Actualizar cantidad
router.put('/:id/cantidad', sincronizarTrasMovimiento, rolePermissionMiddleware(['inventario_edit']), codigosArticulosController.actualizarCantidad);

// DELETE - Eliminar artículo
router.delete('/:id', sincronizarTrasMovimiento, rolePermissionMiddleware(['inventario_delete']), codigosArticulosController.deleteArticulo);

module.exports = router;
