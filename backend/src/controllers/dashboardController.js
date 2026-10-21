const pool = require('../db/connection');

const safe = async (query, params = []) => {
  try {
    return (await pool.query(query, params)).rows;
  } catch (error) {
    console.error('Error en dashboard:', error.message);
    return [];
  }
};

// Valor de inventario a costo; si el artículo no tiene costo se usa su precio de venta.
// Es la misma regla que muestra la página de Artículos.
const UNIT_VALUE = 'COALESCE(NULLIF(precio_costo, 0), precio_unitario, 0)';

// Costo de lo vendido en un mes (0 = mes actual, 1 = mes anterior).
const costOfSales = (monthsAgo) => `
  (SELECT COALESCE(SUM(vi.cantidad * COALESCE(a.precio_costo, 0)), 0)::float
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     LEFT JOIN codigos_articulos a ON a.id = vi.articulo_id
    WHERE v.estado <> 'anulada'
      AND date_trunc('month', v.fecha) = date_trunc('month', CURRENT_DATE - INTERVAL '${monthsAgo} month'))`;

// Sin datos del mes anterior no hay con qué comparar: null oculta la variación.
const pctChange = (current, previous) => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

/**
 * GET /api/dashboard
 * KPIs, ventas de los últimos 7 días, distribución de inventario y
 * transacciones recientes calculados con datos reales de la organización.
 */
const getDashboard = async (req, res) => {
  try {
    const [months, inventory, inventoryByCategory, salesByDay, recent] = await Promise.all([
      safe(`
        SELECT
          (SELECT COALESCE(SUM(total), 0)::float FROM ventas
             WHERE estado <> 'anulada' AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)) AS ingresos,
          (SELECT COALESCE(SUM(total), 0)::float FROM ventas
             WHERE estado <> 'anulada' AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')) AS ingresos_prev,
          (SELECT COALESCE(SUM(total), 0)::float FROM compras
             WHERE estado <> 'cancelada' AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)) AS gastos,
          (SELECT COALESCE(SUM(total), 0)::float FROM compras
             WHERE estado <> 'cancelada' AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')) AS gastos_prev,
          ${costOfSales(0)} AS costo_ventas,
          ${costOfSales(1)} AS costo_ventas_prev,
          (SELECT COUNT(*)::int FROM codigos_articulos WHERE activo = true) AS articulos,
          (SELECT COUNT(*)::int FROM ventas WHERE estado <> 'anulada') AS ventas
      `),
      safe(`
        SELECT COALESCE(SUM(${UNIT_VALUE} * GREATEST(COALESCE(cantidad_disponible, 0), 0)), 0)::float AS valor
        FROM codigos_articulos WHERE activo = true
      `),
      safe(`
        SELECT COALESCE(NULLIF(categoria, ''), 'Sin categoría') AS category,
               SUM(${UNIT_VALUE} * GREATEST(COALESCE(cantidad_disponible, 0), 0))::float AS value
        FROM codigos_articulos WHERE activo = true
        GROUP BY 1
        HAVING SUM(${UNIT_VALUE} * GREATEST(COALESCE(cantidad_disponible, 0), 0)) > 0
        ORDER BY value DESC
        LIMIT 8
      `),
      safe(`
        SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(v.total), 0)::float AS sales
        FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, INTERVAL '1 day') d
        LEFT JOIN ventas v ON v.fecha = d::date AND v.estado <> 'anulada'
        GROUP BY d ORDER BY d
      `),
      safe(`
        SELECT * FROM (
          SELECT fecha, created_at, 'Venta' AS type, 'Venta ' || numero_venta AS description,
                 total::float AS amount, estado AS status
          FROM ventas
          UNION ALL
          SELECT fecha, created_at, 'Compra', 'Compra ' || numero_compra, total::float, estado
          FROM compras
        ) t
        ORDER BY fecha DESC, created_at DESC
        LIMIT 8
      `)
    ]);

    const m = months[0] || {};
    const ingresos = m.ingresos || 0;
    const gastos = m.gastos || 0;
    // Margen bruto: lo que queda de las ventas después de su costo.
    const margen = ingresos > 0 ? ((ingresos - (m.costo_ventas || 0)) / ingresos) * 100 : 0;
    const margenPrev = m.ingresos_prev > 0
      ? ((m.ingresos_prev - (m.costo_ventas_prev || 0)) / m.ingresos_prev) * 100
      : 0;

    res.json({
      success: true,
      data: {
        kpis: {
          ingresos,
          ingresosChange: pctChange(ingresos, m.ingresos_prev || 0),
          gastos,
          gastosChange: pctChange(gastos, m.gastos_prev || 0),
          inventario: (inventory[0] || {}).valor || 0,
          margen,
          margenChange: m.ingresos_prev > 0 ? margen - margenPrev : null
        },
        onboarding: {
          articulos: m.articulos || 0,
          ventas: m.ventas || 0
        },
        salesByDay,
        inventoryByCategory,
        recent
      }
    });
  } catch (error) {
    console.error('Error en getDashboard:', error);
    res.status(500).json({ success: false, message: 'Error al obtener el dashboard' });
  }
};

/**
 * GET /api/dashboard/transactions?type=Venta|Compra&from&to
 * Movimientos de ventas y compras unificados.
 */
const getTransactions = async (req, res) => {
  try {
    const { type, from, to } = req.query;
    const rows = await pool.query(`
      SELECT * FROM (
        SELECT v.id, v.fecha, v.created_at, 'Venta' AS type, v.numero_venta AS number,
               'Venta ' || v.numero_venta AS description, v.total::float AS amount, v.estado AS status,
               (SELECT COALESCE(SUM(cantidad), 0)::int FROM venta_items WHERE venta_id = v.id) AS quantity
        FROM ventas v
        UNION ALL
        SELECT c.id, c.fecha, c.created_at, 'Compra', c.numero_compra,
               'Compra ' || c.numero_compra, c.total::float, c.estado,
               (SELECT COALESCE(SUM(cantidad), 0)::int FROM compra_items WHERE compra_id = c.id)
        FROM compras c
      ) t
      WHERE ($1::text IS NULL OR type = $1)
        AND ($2::date IS NULL OR fecha >= $2::date)
        AND ($3::date IS NULL OR fecha <= $3::date)
      ORDER BY fecha DESC, created_at DESC
      LIMIT 500
    `, [type || null, from || null, to || null]);
    res.json({ success: true, data: rows.rows });
  } catch (error) {
    console.error('Error en getTransactions:', error);
    res.status(500).json({ success: false, message: 'Error al obtener transacciones' });
  }
};

module.exports = { getDashboard, getTransactions };
