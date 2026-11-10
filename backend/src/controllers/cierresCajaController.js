const { randomUUID } = require('crypto');
const pool = require('../db/connection');
const { registrarMovimientoCaja } = require('../utils/cajaLedger');

// Cierre de caja. Cada cobro (venta de contado o abono) queda en pagos_factura con su método y
// quien cobró. La cajera ve lo que lleva cobrado desde su último cierre; el administrador compara
// eso con lo que recibió (efectivo entregado, vouchers de tarjeta, transferencias vistas en la
// cuenta) y aprueba el cierre. Los cobros incluidos quedan marcados y sus ventas ya no se pueden
// modificar. Un faltante o sobrante de efectivo se registra en Caja.

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'otros'];
const MAX_MONTO = 99999999.99;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (!error.expose) console.error(fallback, error);
  res.status(error.status || 500).json({ success: false, error: error.expose ? error.message : fallback });
};

const nombreDe = (user) => [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.email || null;
const centavos = (valor) => Math.round(Number(valor) * 100) / 100;
const fechaTexto = (valor) => (valor instanceof Date ? valor.toISOString().slice(0, 10) : valor ? String(valor).slice(0, 10) : null);

// Totales por método de un grupo de cobros (p = pagos_factura).
const TOTALES = `
  COUNT(*)::int AS cobros,
  (COUNT(*) FILTER (WHERE p.origen = 'contado'))::int AS ventas,
  (COUNT(*) FILTER (WHERE p.origen <> 'contado'))::int AS abonos,
  COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'efectivo'), 0) AS efectivo,
  COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'tarjeta'), 0) AS tarjeta,
  COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'transferencia'), 0) AS transferencia,
  COALESCE(SUM(p.monto) FILTER (WHERE lower(COALESCE(p.metodo_pago, '')) NOT IN ('efectivo', 'tarjeta', 'transferencia')), 0) AS otros,
  MIN(p.fecha) AS desde, MAX(p.fecha) AS hasta_fecha,
  -- Como texto: conserva los microsegundos para cerrar exactamente hasta este cobro.
  MAX(p.created_at)::text AS hasta`;

const mapTotales = (row) => ({
  cobros: row.cobros,
  ventas: row.ventas,
  abonos: row.abonos,
  efectivo: Number(row.efectivo),
  tarjeta: Number(row.tarjeta),
  transferencia: Number(row.transferencia),
  otros: Number(row.otros),
  total: centavos(Number(row.efectivo) + Number(row.tarjeta) + Number(row.transferencia) + Number(row.otros)),
  desde: fechaTexto(row.desde),
  hastaFecha: fechaTexto(row.hasta_fecha),
  hasta: row.hasta
});

const mapCierre = (row) => {
  const sistema = {}; const recibido = {}; const diferencia = {};
  METODOS.forEach((metodo) => {
    sistema[metodo] = Number(row[`sistema_${metodo}`]);
    recibido[metodo] = Number(row[`recibido_${metodo}`]);
    diferencia[metodo] = centavos(recibido[metodo] - sistema[metodo]);
  });
  const suma = (obj) => centavos(METODOS.reduce((total, metodo) => total + obj[metodo], 0));
  return {
    id: row.id,
    numero: row.numero,
    estado: row.estado,
    cajeroId: row.cajero_id,
    cajeroNombre: row.cajero_nombre,
    desde: fechaTexto(row.desde),
    hasta: fechaTexto(row.hasta),
    cobros: row.cobros,
    sistema: { ...sistema, total: suma(sistema) },
    recibido: { ...recibido, total: suma(recibido) },
    diferencia: { ...diferencia, total: suma(diferencia) },
    nota: row.nota,
    aprobadoPor: row.aprobado_por_nombre,
    aprobadoAt: row.created_at
  };
};

/** GET /api/cierres-caja/mi-caja — lo que la cajera lleva cobrado desde su último cierre. */
const miCaja = async (req, res) => {
  try {
    const [pendiente, ultimo] = await Promise.all([
      pool.query(`SELECT ${TOTALES} FROM pagos_factura p WHERE p.cierre_id IS NULL AND p.usuario_id = $1`, [req.user.id]),
      pool.query(
        `SELECT * FROM cierres_caja WHERE cajero_id = $1 AND estado = 'aprobado' ORDER BY created_at DESC LIMIT 1`,
        [req.user.id]
      )
    ]);
    res.json({
      success: true,
      pendiente: mapTotales(pendiente.rows[0]),
      ultimoCierre: ultimo.rows[0] ? mapCierre(ultimo.rows[0]) : null
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo lo cobrado');
  }
};

/** GET /api/cierres-caja/pendientes — cobros sin cerrar, por cajera (administrador). */
const pendientes = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.usuario_id, NULLIF(TRIM(CONCAT(u.nombre, ' ', u.apellido)), '') AS nombre, u.email, ${TOTALES}
       FROM pagos_factura p
       LEFT JOIN users u ON u.id = p.usuario_id
       WHERE p.cierre_id IS NULL
       GROUP BY p.usuario_id, u.nombre, u.apellido, u.email
       ORDER BY MIN(p.created_at)`
    );
    res.json({
      success: true,
      pendientes: rows.map((row) => ({
        cajeroId: row.usuario_id,
        cajeroNombre: row.nombre || row.email || 'Sin usuario',
        ...mapTotales(row)
      }))
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo las cajas por cerrar');
  }
};

/** GET /api/cierres-caja — cierres aprobados, del más reciente al más antiguo (administrador). */
const listar = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cierres_caja ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, cierres: rows.map(mapCierre) });
  } catch (error) {
    sendError(res, error, 'Error obteniendo los cierres de caja');
  }
};

const leerMonto = (valor, etiqueta) => {
  if (valor === '' || valor === null || valor === undefined) throw httpError(400, `Escribe ${etiqueta} (0 si no hubo)`);
  const monto = Number(valor);
  if (!Number.isFinite(monto) || monto < 0 || monto > MAX_MONTO) throw httpError(400, `${etiqueta} no es un monto válido`);
  return centavos(monto);
};

/**
 * POST /api/cierres-caja
 * { cajeroId, hasta, recibido: { efectivo, tarjeta, transferencia, otros }, nota }
 * Cierra los cobros pendientes de esa cajera registrados hasta «hasta» (el último que vio el
 * administrador): los que entren mientras tanto quedan para el siguiente cierre.
 */
const aprobar = async (req, res) => {
  let client;
  try {
    const cajeroId = req.body.cajeroId === null || req.body.cajeroId === undefined || req.body.cajeroId === ''
      ? null : Number(req.body.cajeroId);
    if (cajeroId !== null && !Number.isInteger(cajeroId)) throw httpError(400, 'Cajera no válida');
    const hasta = String(req.body.hasta || '');
    if (!hasta || Number.isNaN(Date.parse(hasta.replace(' ', 'T')))) throw httpError(400, 'Vuelve a abrir el cierre: falta hasta qué cobro se cierra');
    const recibidoIn = req.body.recibido || {};
    const recibido = {
      efectivo: leerMonto(recibidoIn.efectivo, 'el efectivo entregado'),
      tarjeta: leerMonto(recibidoIn.tarjeta, 'el total de vouchers'),
      transferencia: leerMonto(recibidoIn.transferencia, 'lo confirmado en la cuenta'),
      otros: recibidoIn.otros === undefined ? null : leerMonto(recibidoIn.otros, 'lo comprobado de otros métodos')
    };
    const nota = String(req.body.nota || '').trim().slice(0, 2000) || null;

    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cierres_caja_' || app_current_organization_id()))");
    const siguiente = await client.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(numero, '\\D', '', 'g'), '')::INTEGER), 0) + 1 AS n FROM cierres_caja`
    );
    const numero = `CC-${String(siguiente.rows[0].n).padStart(5, '0')}`;
    const id = `CC-${randomUUID()}`;
    const cajero = cajeroId === null ? null
      : (await client.query('SELECT nombre, apellido, email FROM users WHERE id = $1', [cajeroId])).rows[0];
    const cajeroNombre = cajeroId === null ? 'Sin usuario' : nombreDe(cajero) || `Usuario ${cajeroId}`;
    await client.query(
      'INSERT INTO cierres_caja (id, numero, cajero_id, cajero_nombre, aprobado_por, aprobado_por_nombre, nota) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, numero, cajeroId, cajeroNombre, req.user.id, nombreDe(req.user), nota]
    );

    // Marcar los cobros dentro de la misma transacción: si otro administrador ya los cerró, no quedan.
    const marcados = await client.query(
      `UPDATE pagos_factura SET cierre_id = $1
       WHERE cierre_id IS NULL AND usuario_id IS NOT DISTINCT FROM $2 AND created_at <= $3::timestamp
       RETURNING id`,
      [id, cajeroId, hasta]
    );
    if (!marcados.rows.length) throw httpError(409, 'Esa caja ya no tiene cobros por cerrar; quizá otro administrador la cerró. Actualiza la lista.');
    const totales = mapTotales((await client.query(`SELECT ${TOTALES} FROM pagos_factura p WHERE p.cierre_id = $1`, [id])).rows[0]);
    if (recibido.otros === null) recibido.otros = totales.otros;

    const diferencias = METODOS.map((metodo) => centavos(recibido[metodo] - totales[metodo]));
    if (diferencias.some((diferencia) => diferencia !== 0) && !nota) {
      throw httpError(400, 'Hay diferencias: escribe una nota que explique el faltante o sobrante');
    }

    await client.query(
      `UPDATE cierres_caja SET desde = $2, hasta = $3, cobros = $4,
         sistema_efectivo = $5, sistema_tarjeta = $6, sistema_transferencia = $7, sistema_otros = $8,
         recibido_efectivo = $9, recibido_tarjeta = $10, recibido_transferencia = $11, recibido_otros = $12
       WHERE id = $1`,
      [id, totales.desde, totales.hastaFecha, totales.cobros,
        totales.efectivo, totales.tarjeta, totales.transferencia, totales.otros,
        recibido.efectivo, recibido.tarjeta, recibido.transferencia, recibido.otros]
    );

    // El efectivo que faltó o sobró cambia lo que de verdad hay en la caja.
    const diferenciaEfectivo = diferencias[0];
    if (diferenciaEfectivo !== 0) {
      await registrarMovimientoCaja(client, {
        direccion: diferenciaEfectivo < 0 ? 'salida' : 'entrada',
        tipoMovimiento: diferenciaEfectivo < 0 ? 'Egreso' : 'Sobrante de caja',
        monto: Math.abs(diferenciaEfectivo),
        descripcion: `${diferenciaEfectivo < 0 ? 'Faltante' : 'Sobrante'} en cierre de caja ${numero} (${cajeroNombre})`,
        fecha: totales.hastaFecha,
        referencia: numero,
        userId: req.user.id
      });
    }
    await client.query('COMMIT');

    const cierre = (await pool.query('SELECT * FROM cierres_caja WHERE id = $1', [id])).rows[0];
    res.status(201).json({
      success: true,
      cierre: mapCierre(cierre),
      message: `Cierre ${numero} de ${cajeroNombre} aprobado${diferencias.some(Boolean) ? ' con diferencias' : ': todo cuadró'}`
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error aprobando el cierre de caja');
  } finally {
    if (client) client.release();
  }
};

module.exports = { miCaja, pendientes, listar, aprobar };
