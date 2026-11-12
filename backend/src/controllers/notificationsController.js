const pool = require('../db/connection');

const { LOW_STOCK_THRESHOLD } = require('../utils/inventory');
const { resolveUserAccess } = require('../utils/modules');

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
    const access = await resolveUserAccess(pool, req.user.id, req.organization?.modules).catch(() => null);
    const aprueba = Boolean(access?.permissions.some((permiso) => ['admin_config', 'aprobaciones_edit'].includes(permiso)));
    const [lowStock, overdue, purchases, organization, depositosPendientes, depositosRechazados, cierresPendientes, cierresRechazados] = await Promise.all([
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
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE estado = 'ordenada' AND fecha_entrega < CURRENT_DATE)::int AS atrasadas
         FROM compras WHERE estado IN ('pendiente', 'ordenada')`
      ),
      safe(
        `SELECT subscription_status, trial_ends_at FROM organizations
         WHERE id = app_current_organization_id()`
      ),
      // Depósitos y cierres: quien aprueba ve los pendientes; quien los registró, los rechazados.
      aprueba
        ? safe(`SELECT COUNT(*)::int AS total, COALESCE(SUM(monto), 0)::float AS monto
                FROM depositos_caja WHERE estado = 'pendiente'`)
        : [],
      safe(
        `SELECT COUNT(*)::int AS total FROM depositos_caja
         WHERE estado = 'rechazado' AND registrado_por = $1 AND revisado_at > NOW() - INTERVAL '7 days'`,
        [req.user.id]
      ),
      aprueba ? safe(`SELECT COUNT(*)::int AS total FROM cierres_caja WHERE estado = 'pendiente'`) : [],
      safe(
        `SELECT COUNT(*)::int AS total FROM cierres_caja
         WHERE estado = 'rechazado' AND registrado_por = $1 AND rechazado_at > NOW() - INTERVAL '7 days'`,
        [req.user.id]
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
      const { total, atrasadas } = purchases[0];
      notifications.push({
        id: 'pending-purchases',
        type: atrasadas > 0 ? 'warning' : 'info',
        icon: 'fa-cart-shopping',
        title: atrasadas > 0 ? 'Compras atrasadas' : 'Compras por recibir',
        message: `${total} compra${total === 1 ? '' : 's'} por recibir` +
          (atrasadas > 0 ? `; ${atrasadas} ya ${atrasadas === 1 ? 'pasó' : 'pasaron'} su fecha de entrega` : ''),
        page: 'compras'
      });
    }

    if (depositosPendientes[0]?.total > 0) {
      const { total, monto } = depositosPendientes[0];
      notifications.push({
        id: 'pending-deposits',
        type: 'warning',
        icon: 'fa-building-columns',
        title: 'Depósitos por confirmar',
        message: `${total} depósito${total === 1 ? '' : 's'} por Q${monto.toFixed(2)}: revisa que estén en el banco`,
        page: 'caja'
      });
    }

    if (cierresPendientes[0]?.total > 0) {
      const { total } = cierresPendientes[0];
      notifications.push({
        id: 'pending-closings',
        type: 'warning',
        icon: 'fa-lock',
        title: 'Cierres de caja por aprobar',
        message: `${total} cierre${total === 1 ? '' : 's'} de caja ${total === 1 ? 'espera' : 'esperan'} tu aprobación`,
        page: 'caja'
      });
    }

    if (cierresRechazados[0]?.total > 0) {
      const { total } = cierresRechazados[0];
      notifications.push({
        id: 'rejected-closings',
        type: 'danger',
        icon: 'fa-lock',
        title: total === 1 ? 'Cierre de caja rechazado' : 'Cierres de caja rechazados',
        message: `${total} cierre${total === 1 ? '' : 's'} que registraste ${total === 1 ? 'fue rechazado' : 'fueron rechazados'}; mira el motivo en Caja y vuelve a cerrar`,
        page: 'caja'
      });
    }

    if (depositosRechazados[0]?.total > 0) {
      const { total } = depositosRechazados[0];
      notifications.push({
        id: 'rejected-deposits',
        type: 'danger',
        icon: 'fa-building-columns',
        title: total === 1 ? 'Depósito rechazado' : 'Depósitos rechazados',
        message: `${total} depósito${total === 1 ? '' : 's'} que registraste ${total === 1 ? 'fue rechazado' : 'fueron rechazados'}; mira el motivo en Caja`,
        page: 'caja'
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
