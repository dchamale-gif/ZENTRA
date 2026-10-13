// ============================================
// CONTROLADOR DE GASTOS Y SERVICIOS
// ============================================

const db = require('../db/connection');
const { generateId } = require('../utils/helpers');

class ExpensesController {
    /**
     * Obtener gastos registrados
     */
    async getExpenses(req, res) {
        try {
            const { startDate, endDate } = req.query;
            
            let query = `
                SELECT 
                    c.id,
                    c.numero_compra,
                    c.proveedor_id,
                    p.nombre as proveedor_nombre,
                    c.fecha,
                    c.total,
                    c.estado,
                    c.observaciones
                FROM compras c
                LEFT JOIN proveedores p ON c.proveedor_id = p.id
            `;

            const params = [];
            const conditions = [];

            if (startDate && endDate) {
                conditions.push(`c.fecha BETWEEN $${params.length + 1} AND $${params.length + 2}`);
                params.push(startDate, endDate);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY c.fecha DESC LIMIT 100';

            const result = await db.query(query, params);
            
            res.json({
                success: true,
                data: result.rows.map(gasto => ({
                    id: gasto.id,
                    numeroCompra: gasto.numero_compra,
                    proveedorId: gasto.proveedor_id,
                    proveedorNombre: gasto.proveedor_nombre,
                    fecha: gasto.fecha,
                    total: parseFloat(gasto.total),
                    estado: gasto.estado,
                    observaciones: gasto.observaciones
                }))
            });
        } catch (error) {
            console.error('Error en getExpenses:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener gastos',
                error: error.message
            });
        }
    }

    /**
     * Obtener resumen de gastos
     */
    async getExpensesSummary(req, res) {
        try {
            const { startDate, endDate } = req.query;
            
            let query = `
                SELECT 
                    COUNT(*) as cantidad,
                    SUM(total) as total,
                    AVG(total) as promedio,
                    MAX(total) as maximo,
                    MIN(total) as minimo
                FROM compras
                WHERE 1=1
            `;

            const params = [];

            if (startDate && endDate) {
                query += ` AND fecha BETWEEN $1 AND $2`;
                params.push(startDate, endDate);
            }

            const result = await db.query(query, params);
            const row = result.rows[0];

            res.json({
                success: true,
                data: {
                    cantidad: parseInt(row.cantidad) || 0,
                    total: parseFloat(row.total) || 0,
                    promedio: parseFloat(row.promedio) || 0,
                    maximo: parseFloat(row.maximo) || 0,
                    minimo: parseFloat(row.minimo) || 0
                }
            });
        } catch (error) {
            console.error('Error en getExpensesSummary:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener resumen de gastos',
                error: error.message
            });
        }
    }

    /**
     * Obtener gastos por proveedor
     */
    async getExpensesByProvider(req, res) {
        try {
            const { startDate, endDate } = req.query;
            
            let query = `
                SELECT 
                    p.nombre,
                    COUNT(c.id) as cantidad,
                    SUM(c.total) as total,
                    AVG(c.total) as promedio
                FROM compras c
                LEFT JOIN proveedores p ON c.proveedor_id = p.id
                WHERE 1=1
            `;

            const params = [];

            if (startDate && endDate) {
                query += ` AND c.fecha BETWEEN $1 AND $2`;
                params.push(startDate, endDate);
            }

            query += ` GROUP BY p.nombre ORDER BY total DESC`;

            const result = await db.query(query, params);

            res.json({
                success: true,
                data: result.rows.map(row => ({
                    proveedor: row.nombre || 'Sin especificar',
                    cantidad: parseInt(row.cantidad),
                    total: parseFloat(row.total),
                    promedio: parseFloat(row.promedio)
                }))
            });
        } catch (error) {
            console.error('Error en getExpensesByProvider:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener gastos por proveedor',
                error: error.message
            });
        }
    }
}

module.exports = new ExpensesController();
