// ============================================
// CONTROLADOR DE CUENTAS POR COBRAR
// ============================================

const db = require('../db/connection');
const { generateId } = require('../utils/helpers');

class ReceivablesController {
    /**
     * Obtener cuentas por cobrar
     */
    async getReceivables(req, res) {
        try {
            const { status } = req.query;
            
            let query = `
                SELECT 
                    v.id,
                    v.numero_venta,
                    v.paciente_id,
                    p.nombre as paciente_nombre,
                    p.telefono,
                    v.total,
                    COALESCE(SUM(pa.monto), 0) as pagado,
                    v.total - COALESCE(SUM(pa.monto), 0) as pendiente,
                    v.fecha,
                    v.estado,
                    MAX(pa.fecha) as ultima_transaccion
                FROM ventas v
                LEFT JOIN pacientes p ON v.paciente_id = p.id
                LEFT JOIN pagos_factura pa ON v.id = pa.venta_id
                WHERE v.total > COALESCE(SUM(pa.monto), 0)
            `;

            const params = [];

            if (status === 'atrasada') {
                query += ` AND v.fecha < CURRENT_DATE - INTERVAL '30 days'`;
            } else if (status === 'vencida') {
                query += ` AND v.fecha < CURRENT_DATE - INTERVAL '60 days'`;
            }

            query += ` GROUP BY v.id, v.numero_venta, v.paciente_id, p.nombre, p.telefono, v.total, v.fecha, v.estado
                       ORDER BY v.fecha DESC
                       LIMIT 100`;

            const result = await db.query(query, params);
            
            res.json({
                success: true,
                data: result.rows.map(cuenta => ({
                    id: cuenta.id,
                    numeroVenta: cuenta.numero_venta,
                    pacienteId: cuenta.paciente_id,
                    pacienteNombre: cuenta.paciente_nombre,
                    telefonoPaciente: cuenta.telefono,
                    total: parseFloat(cuenta.total),
                    pagado: parseFloat(cuenta.pagado),
                    pendiente: parseFloat(cuenta.pendiente),
                    fecha: cuenta.fecha,
                    estado: cuenta.estado,
                    diasVencido: Math.floor((new Date() - new Date(cuenta.fecha)) / (1000 * 60 * 60 * 24))
                }))
            });
        } catch (error) {
            console.error('Error en getReceivables:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener cuentas por cobrar',
                error: error.message
            });
        }
    }

    /**
     * Obtener resumen de cuentas por cobrar
     */
    async getReceivablesSummary(req, res) {
        try {
            const query = `
                SELECT 
                    COUNT(DISTINCT v.id) as cantidad_facturas,
                    SUM(v.total) as total_facturas,
                    COALESCE(SUM(pa.monto), 0) as total_pagado,
                    SUM(v.total) - COALESCE(SUM(pa.monto), 0) as total_pendiente,
                    COUNT(CASE WHEN v.fecha < CURRENT_DATE - INTERVAL '30 days' 
                              THEN 1 END) as facturas_atrasadas
                FROM ventas v
                LEFT JOIN pagos_factura pa ON v.id = pa.venta_id
                WHERE v.total > COALESCE(SUM(pa.monto), 0)
            `;

            const result = await db.query(query);
            const row = result.rows[0];

            res.json({
                success: true,
                data: {
                    cantidadFacturas: parseInt(row.cantidad_facturas) || 0,
                    totalFacturas: parseFloat(row.total_facturas) || 0,
                    totalPagado: parseFloat(row.total_pagado) || 0,
                    totalPendiente: parseFloat(row.total_pendiente) || 0,
                    facturasAtrasadas: parseInt(row.facturas_atrasadas) || 0
                }
            });
        } catch (error) {
            console.error('Error en getReceivablesSummary:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener resumen de cuentas por cobrar',
                error: error.message
            });
        }
    }

    /**
     * Obtener movimientos de una cuenta por cobrar
     */
    async getReceivableMovements(req, res) {
        try {
            const { venta_id } = req.params;
            
            const query = `
                SELECT 
                    id,
                    venta_id,
                    monto,
                    fecha,
                    metodo_pago,
                    observaciones
                FROM pagos_factura
                WHERE venta_id = $1
                ORDER BY fecha DESC
            `;

            const result = await db.query(query, [venta_id]);
            
            res.json({
                success: true,
                data: result.rows.map(pago => ({
                    id: pago.id,
                    ventaId: pago.venta_id,
                    monto: parseFloat(pago.monto),
                    fecha: pago.fecha,
                    metodoPago: pago.metodo_pago,
                    observaciones: pago.observaciones
                }))
            });
        } catch (error) {
            console.error('Error en getReceivableMovements:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener movimientos de cuenta',
                error: error.message
            });
        }
    }

    /**
     * Registrar pago de cuenta por cobrar
     */
    async recordPayment(req, res) {
        try {
            const { venta_id, monto, metodo_pago, observaciones } = req.body;
            const user_id = req.user.id;

            const pago_id = generateId('PAG');

            // Verificar que la venta exista
            const ventaCheck = await db.query(
                'SELECT id, total FROM ventas WHERE id = $1',
                [venta_id]
            );

            if (ventaCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Factura no encontrada'
                });
            }

            // Insertar pago
            const query = `
                INSERT INTO pagos_factura (id, venta_id, monto, fecha, metodo_pago, observaciones, usuario_id)
                VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)
                RETURNING *
            `;

            const result = await db.query(query, [
                pago_id, venta_id, monto, metodo_pago, observaciones, user_id
            ]);

            res.status(201).json({
                success: true,
                message: 'Pago registrado exitosamente',
                data: result.rows[0]
            });
        } catch (error) {
            console.error('Error en recordPayment:', error);
            res.status(500).json({
                success: false,
                message: 'Error al registrar pago',
                error: error.message
            });
        }
    }
}

module.exports = new ReceivablesController();
