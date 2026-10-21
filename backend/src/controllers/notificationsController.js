const pool = require('../db/connection');

const { LOW_STOCK_THRESHOLD } = require('../utils/inventory');

const safe = async (query, params = []) => {
  try {
    return (await pool.query(query, params)).rows;
  } catch (error) {
    console.error('Error calculando notificación:', error.message);
    return [];
  }
};

/**
 * GET /api/notifications
 * Alertas calculadas en tiempo real para la organización actual.
 */
const getNotifications = async (req, res) => {
  try {
    const [lowStock, overdue, purchases, organization] = await Promise.all([
      safe(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE cantidad_disponible <= 0)::int AS agotados
         FROM codigos_articulos
         WHERE activo = true AND cantidad_disponible <= $1`,
        [LOW_STOCK_THRESHOLD]
      ),
      safe(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(monto_pendiente), 0)::float AS monto
         FROM cuentas_por_cobrar
         WHERE monto_pendiente > 0 AND fecha_vencimiento < CURRENT_DATE
           AND estado NOT IN ('pagado', 'anulado')`
      ),
      safe(
        `SELECT COUNT(*)::int AS total FROM compras WHERE estado = 'pendiente'`
      ),
      safe(
        `SELECT subscription_status, trial_ends_at FROM organizations
         WHERE id = app_current_organization_id()`
      )
    ]);

    const notifications = [];

    if (lowStock[0]?.total > 0) {
      // Mismos grupos que la página de Artículos: "existencia baja" (1 a 5) y "agotados" (0).
      const { total, agotados } = lowStock[0];
      const bajos = total - agotados;
      const plural = (n, singular, pluralForm) => `${n} ${n === 1 ? singular : pluralForm}`;
      const partes = [];
      if (bajos > 0) partes.push(`${plural(bajos, 'artículo', 'artículos')} con ${LOW_STOCK_THRESHOLD} unidades o menos`);
      if (agotados > 0) partes.push(`${plural(agotados, 'artículo agotado', 'artículos agotados')}`);
      notifications.push({
        id: 'low-stock',
        type: agotados > 0 ? 'danger' : 'warning',
        icon: 'fa-boxes-stacked',
        title: agotados > 0 && bajos === 0 ? 'Artículos agotados' : 'Existencia baja',
        message: `${partes.join(' y ')}.`.replace(/^./, c => c.toUpperCase()),
        page: 'codigos-articulos'
      });
    }

    if (overdue[0]?.total > 0) {
      notifications.push({
        id: 'overdue-receivables',
        type: 'danger',
        icon: 'fa-file-invoice-dollar',
        title: 'Cuentas por cobrar vencidas',
        message: `${overdue[0].total} cuenta(s) vencidas por Q${overdue[0].monto.toFixed(2)}`,
        page: 'cuentas-por-cobrar'
      });
    }

    if (purchases[0]?.total > 0) {
      notifications.push({
        id: 'pending-purchases',
        type: 'info',
        icon: 'fa-cart-shopping',
        title: 'Compras pendientes',
        message: `${purchases[0].total} compra(s) pendientes de recibir o pagar`,
        page: 'compras'
      });
    }

    const org = organization[0];
    if (org?.subscription_status === 'trial' && org.trial_ends_at) {
      const days = Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000);
      if (days <= 7) {
        notifications.push({
          id: 'trial-ending',
          type: days <= 2 ? 'danger' : 'warning',
          icon: 'fa-hourglass-half',
          title: 'Prueba por vencer',
          message: days > 0
            ? `Tu periodo de prueba termina en ${days} día(s)`
            : 'Tu periodo de prueba ha finalizado',
          page: null
        });
      }
    }

    res.status(200).json({ success: true, total: notifications.length, notifications });
  } catch (error) {
    console.error('Error en getNotifications:', error);
    res.status(500).json({ error: 'Error obteniendo notificaciones' });
  }
};

module.exports = { getNotifications };
