// ============================================
// CONTROLADOR DE REPORTES Y DASHBOARDS
// Obtiene datos reales de la base de datos
// ============================================

const db = require('../db/connection');

const parseMonths = (value, defaultValue = 12) => {
    const months = Number(value ?? defaultValue);
    if (!Number.isInteger(months) || months < 1 || months > 120) {
        const error = new Error('El rango de meses debe ser un entero entre 1 y 120');
        error.status = 400;
        throw error;
    }
    return months;
};

class ReportsController {
    /**
     * Obtener resumen financiero
     */
    async getFinancialSummary(req, res) {
        try {
            const { startDate, endDate } = req.query;

            // Construir WHERE clauses
            let whereCondition = '';
            const params = [];

            if (startDate && endDate) {
                whereCondition = 'WHERE fecha BETWEEN $1 AND $2';
                params.push(startDate, endDate);
            } else if (startDate) {
                whereCondition = 'WHERE fecha >= $1';
                params.push(startDate);
            } else if (endDate) {
                whereCondition = 'WHERE fecha <= $1';
                params.push(endDate);
            }

            // Calcular ingresos
            const ingresoQuery = `
                SELECT 
                    COALESCE(SUM(total), 0) as total_ingresos,
                    COUNT(*) as numero_transacciones,
                    COALESCE(SUM(descuento), 0) as descuentos_totales,
                    COALESCE(SUM(impuesto), 0) as impuestos_totales,
                    COALESCE(SUM(subtotal), 0) as subtotal
                FROM ventas
                ${whereCondition}
            `;

            // Calcular egresos
            const egresoQuery = `
                SELECT 
                    COALESCE(SUM(total), 0) as total_egresos,
                    COUNT(*) as numero_compras
                FROM compras
                ${whereCondition}
            `;

            const pagosQuery = `
                SELECT
                    COALESCE(SUM(monto), 0) as total_cobros,
                    COUNT(*) as numero_pagos
                FROM caja
                ${whereCondition ? `${whereCondition} AND tipo = 'entrada'` : "WHERE tipo = 'entrada'"}
                    AND COALESCE(estado, 'activo') = 'activo'
            `;

            // Costo de lo vendido en el período (unidades × precio de compra del artículo).
            const costoVentasQuery = `
                SELECT COALESCE(SUM(vi.cantidad * COALESCE(a.precio_costo, 0)), 0) as costo_ventas
                FROM venta_items vi
                JOIN ventas v ON v.id = vi.venta_id
                LEFT JOIN codigos_articulos a ON a.id = vi.articulo_id
                ${whereCondition.replace(/fecha/g, 'v.fecha')}
                ${whereCondition ? 'AND' : 'WHERE'} v.estado <> 'anulada'
            `;

            const saldosQuery = `
                SELECT COALESCE(SUM(monto_pendiente), 0) as saldo_por_cobrar
                FROM cuentas_por_cobrar
            `;

            const [ingresoResult, egresoResult, pagosResult, saldosResult, costoResult] = await Promise.all([
                db.query(ingresoQuery, params),
                db.query(egresoQuery, params),
                db.query(pagosQuery, params),
                db.query(saldosQuery),
                db.query(costoVentasQuery, params)
            ]);

            const ingresos = parseFloat(ingresoResult.rows[0]?.total_ingresos || 0);
            const egresos = parseFloat(egresoResult.rows[0]?.total_egresos || 0);
            const cobrosRecibidos = parseFloat(pagosResult.rows[0]?.total_cobros || 0);
            const saldoPorCobrar = parseFloat(saldosResult.rows[0]?.saldo_por_cobrar || 0);
            const ganancia = ingresos - egresos;
            const margen = ingresos > 0 ? ((ganancia / ingresos) * 100).toFixed(2) : 0;
            const costoVentas = parseFloat(costoResult.rows[0]?.costo_ventas || 0);
            const gananciaBruta = ingresos - costoVentas;

            res.json({
                success: true,
                data: {
                    ingresos,
                    egresos,
                    ganancia,
                    cobrosRecibidos,
                    saldoPorCobrar,
                    flujoCaja: cobrosRecibidos - egresos,
                    margenNeto: parseFloat(margen),
                    costoVentas,
                    gananciaBruta,
                    margenBruto: ingresos > 0 ? Number(((gananciaBruta / ingresos) * 100).toFixed(2)) : 0,
                    // COUNT(*) llega como texto desde pg: se convierte para no concatenar ("1" + 0 = "10").
                    numeroTransacciones: parseInt(ingresoResult.rows[0]?.numero_transacciones || 0, 10),
                    numeroPagos: parseInt(pagosResult.rows[0]?.numero_pagos || 0, 10),
                    numeroCompras: parseInt(egresoResult.rows[0]?.numero_compras || 0, 10),
                    descuentosTotales: parseFloat(ingresoResult.rows[0]?.descuentos_totales || 0),
                    impuestosTotales: parseFloat(ingresoResult.rows[0]?.impuestos_totales || 0),
                    subtotal: parseFloat(ingresoResult.rows[0]?.subtotal || 0),
                    moneda: 'GTQ'
                }
            });
        } catch (error) {
            console.error('Error en getFinancialSummary:', error);
            res.status(error.status || 500).json({
                success: false,
                message: 'Error al obtener resumen financiero',
                error: error.message
            });
        }
    }

    /**
     * Obtener datos históricos mensuales
     */
    async getMonthlyData(req, res) {
        try {
            const months = parseMonths(req.query.months);

            const query = `
                WITH monthly_data AS (
                    SELECT 
                        DATE_TRUNC('month', fecha)::date as mes,
                        COALESCE(SUM(total), 0) as ingresos,
                        COUNT(*) as numero_transacciones,
                        COALESCE(SUM(subtotal), 0) as subtotal
                    FROM ventas
                    WHERE fecha >= CURRENT_DATE - ($1 * INTERVAL '1 month')
                    GROUP BY DATE_TRUNC('month', fecha)
                ),
                monthly_expenses AS (
                    SELECT 
                        DATE_TRUNC('month', fecha)::date as mes,
                        COALESCE(SUM(total), 0) as egresos,
                        COUNT(*) as numero_compras
                    FROM compras
                    WHERE fecha >= CURRENT_DATE - ($1 * INTERVAL '1 month')
                    GROUP BY DATE_TRUNC('month', fecha)
                ),
                monthly_payments AS (
                    SELECT
                        DATE_TRUNC('month', fecha)::date as mes,
                        COALESCE(SUM(monto), 0) as cobros,
                        COUNT(*) as numero_pagos
                    FROM caja
                    WHERE tipo = 'entrada'
                      AND COALESCE(estado, 'activo') = 'activo'
                      AND fecha >= CURRENT_DATE - ($1 * INTERVAL '1 month')
                    GROUP BY DATE_TRUNC('month', fecha)
                ),
                months_with_activity AS (
                    SELECT mes FROM monthly_data
                    UNION
                    SELECT mes FROM monthly_expenses
                    UNION
                    SELECT mes FROM monthly_payments
                )
                SELECT 
                    ma.mes,
                    COALESCE(md.ingresos, 0) as ingresos,
                    COALESCE(me.egresos, 0) as egresos,
                    COALESCE(md.ingresos, 0) - COALESCE(me.egresos, 0) as ganancia,
                    COALESCE(mp.cobros, 0) as cobros,
                    COALESCE(mp.cobros, 0) - COALESCE(me.egresos, 0) as flujo_caja,
                    COALESCE(md.numero_transacciones, 0) as ventas,
                    COALESCE(me.numero_compras, 0) as compras,
                    COALESCE(mp.numero_pagos, 0) as pagos
                FROM months_with_activity ma
                LEFT JOIN monthly_data md ON ma.mes = md.mes
                LEFT JOIN monthly_expenses me ON ma.mes = me.mes
                LEFT JOIN monthly_payments mp ON ma.mes = mp.mes
                ORDER BY ma.mes DESC
                LIMIT $1
            `;

            const result = await db.query(query, [months]);
            const data = result.rows.reverse().map(row => ({
                mes: this.formatMonth(row.mes),
                ingresos: parseFloat(row.ingresos),
                egresos: parseFloat(row.egresos),
                ganancia: parseFloat(row.ganancia),
                cobros: parseFloat(row.cobros),
                flujoCaja: parseFloat(row.flujo_caja),
                ventas: parseInt(row.ventas),
                transacciones: parseInt(row.ventas),
                compras: parseInt(row.compras),
                pagos: parseInt(row.pagos),
                moneda: 'GTQ'
            }));

            res.json({
                success: true,
                data
            });
        } catch (error) {
            console.error('Error en getMonthlyData:', error);
            res.status(error.status || 500).json({
                success: false,
                message: 'Error al obtener datos mensuales',
                error: error.message
            });
        }
    }

    /**
     * Obtener datos por categoría de gastos
     */
    async getExpensesByCategory(req, res) {
        try {
            const { startDate, endDate } = req.query;

            let whereCondition = '';
            const params = [];

            if (startDate && endDate) {
                whereCondition = 'AND c.fecha BETWEEN $1 AND $2';
                params.push(startDate, endDate);
            }

            const query = `
                SELECT 
                    p.nombre as categoria,
                    COALESCE(SUM(ci.subtotal), 0) as monto,
                    COUNT(DISTINCT c.id) as numero_compras
                FROM compra_items ci
                JOIN compras c ON ci.compra_id = c.id
                LEFT JOIN proveedores p ON c.proveedor_id = p.id
                WHERE 1=1 ${whereCondition}
                GROUP BY p.nombre
                ORDER BY monto DESC
            `;

            const result = await db.query(query, params);
            
            const totalMonto = result.rows.reduce((sum, row) => sum + parseFloat(row.monto), 0);
            const data = result.rows.map(row => ({
                nombre: row.categoria || 'Sin clasificar',
                monto: parseFloat(row.monto),
                porcentaje: totalMonto > 0 ? ((parseFloat(row.monto) / totalMonto) * 100).toFixed(1) : 0,
                numeroCopmpras: parseInt(row.numero_compras)
            }));

            res.json({
                success: true,
                data,
                totalMonto
            });
        } catch (error) {
            console.error('Error en getExpensesByCategory:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener gastos por categoría',
                error: error.message
            });
        }
    }

    /**
     * Obtener datos por categoría de ingresos
     */
    async getIncomeByCategory(req, res) {
        try {
            const { startDate, endDate } = req.query;

            let whereCondition = '';
            const params = [];

            if (startDate && endDate) {
                whereCondition = 'AND v.fecha BETWEEN $1 AND $2';
                params.push(startDate, endDate);
            }

            // Categorizar ingresos: por medicinas, por servicios, etc.
            const query = `
                SELECT 
                    CASE 
                        WHEN vi.medicina_id IS NOT NULL THEN 'Medicinas'
                        WHEN vi.articulo_id IS NOT NULL THEN 'Artículos'
                        ELSE 'Otros'
                    END as categoria,
                    COALESCE(SUM(vi.subtotal), 0) as monto,
                    COUNT(DISTINCT v.id) as numero_ventas
                FROM venta_items vi
                JOIN ventas v ON vi.venta_id = v.id
                WHERE 1=1 ${whereCondition}
                GROUP BY categoria
                ORDER BY monto DESC
            `;

            const result = await db.query(query, params);
            
            const totalMonto = result.rows.reduce((sum, row) => sum + parseFloat(row.monto), 0);
            const data = result.rows.map(row => ({
                nombre: row.categoria,
                monto: parseFloat(row.monto),
                porcentaje: totalMonto > 0 ? ((parseFloat(row.monto) / totalMonto) * 100).toFixed(1) : 0,
                numeroVentas: parseInt(row.numero_ventas)
            }));

            res.json({
                success: true,
                data,
                totalMonto
            });
        } catch (error) {
            console.error('Error en getIncomeByCategory:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener ingresos por categoría',
                error: error.message
            });
        }
    }

    /**
     * Obtener datos diarios (últimos 30 días)
     */
    async getDailyData(req, res) {
        try {
            const query = `
                WITH daily_data AS (
                    SELECT 
                        fecha,
                        COALESCE(SUM(total), 0) as ingresos,
                        COUNT(*) as transacciones
                    FROM ventas
                    WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
                    GROUP BY fecha
                ),
                daily_expenses AS (
                    SELECT 
                        fecha,
                        COALESCE(SUM(total), 0) as egresos
                    FROM compras
                    WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
                    GROUP BY fecha
                )
                SELECT 
                    COALESCE(dd.fecha, de.fecha) as fecha,
                    COALESCE(dd.ingresos, 0) as ingresos,
                    COALESCE(de.egresos, 0) as egresos,
                    COALESCE(dd.ingresos, 0) - COALESCE(de.egresos, 0) as ganancia,
                    COALESCE(dd.transacciones, 0) as transacciones
                FROM daily_data dd
                FULL OUTER JOIN daily_expenses de ON dd.fecha = de.fecha
                ORDER BY fecha DESC
                LIMIT 30
            `;

            const result = await db.query(query);
            const data = result.rows.reverse().map(row => ({
                fecha: row.fecha,
                ingresos: parseFloat(row.ingresos),
                egresos: parseFloat(row.egresos),
                ganancia: parseFloat(row.ganancia),
                transacciones: parseInt(row.transacciones)
            }));

            res.json({
                success: true,
                data
            });
        } catch (error) {
            console.error('Error en getDailyData:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener datos diarios',
                error: error.message
            });
        }
    }

    /**
     * Obtener reporte consolidado
     */
    async getConsolidatedReport(req, res) {
        try {
            const { startDate, endDate, period = 'mes' } = req.query;

            // Obtener resumen financiero
            const summaryResult = await this.getFinancialSummary({ query: { startDate, endDate } }, {
                json: () => null,
                status: () => ({ json: () => null })
            });

            // Obtener datos históricos
            let monthsCount = 12;
            if (period === 'semana') monthsCount = 1;
            if (period === 'año') monthsCount = 24;

            const monthlyResult = await db.query(`
                WITH monthly_data AS (
                    SELECT 
                        DATE_TRUNC('month', fecha)::date as mes,
                        COALESCE(SUM(total), 0) as ingresos,
                        COUNT(*) as numero_transacciones,
                        COALESCE(SUM(subtotal), 0) as subtotal
                    FROM ventas
                    WHERE fecha >= CURRENT_DATE - ($1 * INTERVAL '1 month')
                    GROUP BY DATE_TRUNC('month', fecha)
                ),
                monthly_expenses AS (
                    SELECT 
                        DATE_TRUNC('month', fecha)::date as mes,
                        COALESCE(SUM(total), 0) as egresos,
                        COUNT(*) as numero_compras
                    FROM compras
                    WHERE fecha >= CURRENT_DATE - ($1 * INTERVAL '1 month')
                    GROUP BY DATE_TRUNC('month', fecha)
                )
                SELECT 
                    COALESCE(md.mes, me.mes) as mes,
                    COALESCE(md.ingresos, 0) as ingresos,
                    COALESCE(me.egresos, 0) as egresos,
                    COALESCE(md.ingresos, 0) - COALESCE(me.egresos, 0) as ganancia
                FROM monthly_data md
                FULL OUTER JOIN monthly_expenses me ON md.mes = me.mes
                ORDER BY mes DESC
            `, [monthsCount]);

            const monthlyData = monthlyResult.rows.reverse().map(row => ({
                mes: this.formatMonth(row.mes),
                ingresos: parseFloat(row.ingresos),
                egresos: parseFloat(row.egresos),
                ganancia: parseFloat(row.ganancia)
            }));

            res.json({
                success: true,
                data: {
                    resumen: {
                        ingresos: 0,
                        egresos: 0,
                        ganancia: 0
                    },
                    historico: monthlyData
                }
            });
        } catch (error) {
            console.error('Error en getConsolidatedReport:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener reporte consolidado',
                error: error.message
            });
        }
    }

    /**
     * Formatear mes a nombre legible
     */
    formatMonth(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return months[date.getMonth()];
    }

    /**
     * Obtener datos de flujo de caja
     */
    async getCashFlowData(req, res) {
        try {
            const months = parseMonths(req.query.months);

            const query = `
                WITH daily_flow AS (
                    SELECT 
                        fecha,
                        COALESCE(SUM(total), 0) as ingresos_diarios,
                        0 as egresos_diarios
                    FROM ventas
                    WHERE fecha >= CURRENT_DATE - ($1 * INTERVAL '1 month')
                    GROUP BY fecha
                    UNION ALL
                    SELECT 
                        fecha,
                        0 as ingresos_diarios,
                        COALESCE(SUM(total), 0) as egresos_diarios
                    FROM compras
                    WHERE fecha >= CURRENT_DATE - ($1 * INTERVAL '1 month')
                    GROUP BY fecha
                )
                SELECT 
                    fecha,
                    SUM(ingresos_diarios - egresos_diarios) OVER (ORDER BY fecha) as flujo_acumulado,
                    SUM(ingresos_diarios) OVER (ORDER BY fecha) as ingresos_acumulados,
                    SUM(egresos_diarios) OVER (ORDER BY fecha) as egresos_acumulados
                FROM daily_flow
                ORDER BY fecha
            `;

            const result = await db.query(query, [months]);
            const data = result.rows.map(row => ({
                fecha: row.fecha,
                flujoAcumulado: parseFloat(row.flujo_acumulado),
                ingresosAcumulados: parseFloat(row.ingresos_acumulados),
                egresosAcumulados: parseFloat(row.egresos_acumulados)
            }));

            res.json({
                success: true,
                data
            });
        } catch (error) {
            console.error('Error en getCashFlowData:', error);
            res.status(error.status || 500).json({
                success: false,
                message: 'Error al obtener datos de flujo de caja',
                error: error.message
            });
        }
    }

    /**
     * Obtener top de productos más vendidos
     */
    async getTopSellingProducts(req, res) {
        try {
            const { limit = 10, startDate, endDate } = req.query;

            let whereCondition = '';
            const params = [];

            if (startDate && endDate) {
                whereCondition = 'AND v.fecha BETWEEN $1 AND $2';
                params.push(startDate, endDate);
            }

            const query = `
                SELECT 
                    COALESCE(m.nombre, ca.nombre_articulo, 'Desconocido') as producto,
                    SUM(vi.cantidad) as cantidad_vendida,
                    SUM(vi.subtotal) as total_ventas,
                    AVG(vi.precio_unitario) as precio_promedio
                FROM venta_items vi
                JOIN ventas v ON vi.venta_id = v.id
                LEFT JOIN medicinas m ON vi.medicina_id = m.id
                LEFT JOIN codigos_articulos ca ON vi.articulo_id = ca.id
                WHERE 1=1 ${whereCondition}
                GROUP BY producto
                ORDER BY total_ventas DESC
                LIMIT $${params.length + 1}
            `;

            const result = await db.query(query, [...params, limit]);
            const data = result.rows.map(row => ({
                producto: row.producto,
                cantidadVendida: parseInt(row.cantidad_vendida),
                totalVentas: parseFloat(row.total_ventas),
                precioPromedio: parseFloat(row.precio_promedio)
            }));

            res.json({
                success: true,
                data
            });
        } catch (error) {
            console.error('Error en getTopSellingProducts:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener productos más vendidos',
                error: error.message
            });
        }
    }
}

module.exports = new ReportsController();
