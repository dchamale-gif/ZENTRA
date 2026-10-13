const pool = require('../db/connection');

const safe = async (query, params = []) => {
  try {
    return (await pool.query(query, params)).rows;
  } catch (error) {
    console.error('Error en dashboard:', error.message);
    return [];
  }
};

const pctChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
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
             WHERE estado <> 'cancelada' AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')) AS gastos_prev
      `),
      safe(`
        SELECT COALESCE(SUM(COALESCE(precio_unitario, 0) * COALESCE(cantidad_disponible, 0)), 0)::float AS valor
        FROM codigos_articulos WHERE activo = true
      `),
      safe(`
        SELECT COALESCE(NULLIF(categoria, ''), 'Sin categoría') AS category,
               SUM(COALESCE(precio_unitario, 0) * COALESCE(cantidad_disponible, 0))::float AS value
        FROM codigos_articulos WHERE activo = true
        GROUP BY 1
        HAVING SUM(COALESCE(precio_unitario, 0) * COALESCE(cantidad_disponible, 0)) > 0
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
    const margen = ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : 0;
    const margenPrev = m.ingresos_prev > 0
      ? ((m.ingresos_prev - m.gastos_prev) / m.ingresos_prev) * 100
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
          margenChange: margen - margenPrev
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

module.exports = { getDashboard };
