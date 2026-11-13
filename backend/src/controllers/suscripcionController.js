const authPool = require('../db/authConnection');
const { leerComprobante } = require('../utils/comprobantes');
const { generarFactura } = require('../utils/pdfFactura');
const { FACTURA_SELECT, mapFactura } = require('./facturasPlataformaController');

// Suscripción de la empresa a BotEngine, vista desde su ERP (solo administradores):
// forma de pago (transferencia o tarjeta), facturas de BotEngine y comprobantes de transferencia.
// facturas_plataforma no es una tabla de las empresas (sin RLS), así que se usa el rol de
// autenticación y cada consulta filtra por la empresa de la sesión.

const FORMAS_PAGO = new Set(['transferencia', 'tarjeta']);
// Comprobantes por factura: alcanza para corregir varias veces sin llenar la base.
const MAX_COMPROBANTES = 10;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (!error.expose) console.error(fallback, error);
  res.status(error.status || 500).json({ success: false, error: error.expose ? error.message : fallback });
};

const fecha = (value) => (value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : null);
const nombreDe = (user) => [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.email || null;

// Lo que el cliente ve de una factura: sin datos internos de soporte.
const facturaCliente = (row) => {
  const factura = mapFactura(row);
  return {
    id: factura.id,
    numero: factura.numero,
    concepto: factura.items.map((item) => item.descripcion).join(' · '),
    periodo: factura.periodo,
    total: factura.total,
    fechaEmision: factura.fechaEmision,
    fechaVencimiento: factura.fechaVencimiento,
    estado: factura.estado,
    pagadaEn: factura.pagadaEn,
    enlacePago: factura.enlacePago,
    comprobantes: factura.comprobantes.map((c) => ({
      id: c.id, estado: c.estado, referencia: c.referencia, fechaPago: c.fechaPago,
      motivoRechazo: c.motivoRechazo, subidoAt: c.subidoAt, nombreArchivo: c.nombreArchivo
    }))
  };
};

/** GET /api/suscripcion — forma de pago, plan, datos para transferir y facturas de BotEngine. */
const resumen = async (req, res) => {
  try {
    const orgId = req.organization.id;
    const [org, facturas] = await Promise.all([
      authPool.query(
        `SELECT nombre, forma_pago, periodicidad, mes_cobro_anual, cuota_mensual, enlace_pago, usa_erp,
                subscription_status, trial_ends_at, subscription_ends_at, license_plan
         FROM organizations WHERE id = $1`,
        [orgId]
      ),
      authPool.query(
        `${FACTURA_SELECT} WHERE f.organization_id = $1 AND f.estado <> 'anulada'
         ORDER BY f.fecha_emision DESC, f.id DESC LIMIT 24`,
        [orgId]
      )
    ]);
    const o = org.rows[0];
    if (!o) throw httpError(404, 'Empresa no encontrada');
    res.json({
      success: true,
      suscripcion: {
        empresa: o.nombre,
        formaPago: o.forma_pago,
        periodicidad: o.periodicidad,
        mesCobroAnual: o.mes_cobro_anual,
        cuota: o.cuota_mensual === null ? null : Number(o.cuota_mensual),
        plan: o.license_plan,
        estado: o.subscription_status,
        pruebaHasta: o.trial_ends_at,
        vigenteHasta: o.subscription_ends_at,
        enlacePago: o.enlace_pago || null,
        // Cuenta para transferir; la misma que va en el PDF de la factura.
        datosTransferencia: (process.env.FACTURA_DATOS_PAGO || '').trim() || null
      },
      facturas: facturas.rows.map(facturaCliente)
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo la suscripción');
  }
};

/** PUT /api/suscripcion/forma-pago { formaPago: 'transferencia' | 'tarjeta' } */
const elegirFormaPago = async (req, res) => {
  try {
    const formaPago = String(req.body.formaPago || '');
    if (!FORMAS_PAGO.has(formaPago)) throw httpError(400, 'Elige transferencia o tarjeta');
    await authPool.query(
      'UPDATE organizations SET forma_pago = $2, forma_pago_elegida_en = NOW(), updated_at = NOW() WHERE id = $1',
      [req.organization.id, formaPago]
    );
    res.json({
      success: true,
      formaPago,
      message: formaPago === 'tarjeta'
        ? 'Listo: pagarás con tarjeta. Cuando tengas una factura, verás aquí el enlace para pagarla.'
        : 'Listo: pagarás por transferencia. Cuando tengas una factura, adjunta aquí el comprobante.'
    });
  } catch (error) {
    sendError(res, error, 'Error guardando la forma de pago');
  }
};

const facturaDeLaEmpresa = async (db, req, { bloquear = false } = {}) => {
  const { rows } = await db.query(
    `SELECT id, numero, estado FROM facturas_plataforma WHERE id = $1 AND organization_id = $2${bloquear ? ' FOR UPDATE' : ''}`,
    [Number(req.params.id), req.organization.id]
  );
  if (!rows[0]) throw httpError(404, 'Factura no encontrada');
  return rows[0];
};

/**
 * POST /api/suscripcion/facturas/:id/comprobantes
 * { archivo (base64), nombreArchivo?, referencia?, fechaPago?, nota? } — queda por revisar.
 */
const subirComprobante = async (req, res) => {
  let client;
  try {
    const archivo = leerComprobante(req.body.archivo);
    const referencia = String(req.body.referencia || '').trim().slice(0, 100) || null;
    const nota = String(req.body.nota || '').trim().slice(0, 500) || null;
    const nombreArchivo = String(req.body.nombreArchivo || '').trim().slice(0, 150) || null;
    const fechaPago = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.fechaPago || '')) ? req.body.fechaPago : null;

    client = await authPool.connect();
    await client.query('BEGIN');
    const factura = await facturaDeLaEmpresa(client, req, { bloquear: true });
    if (factura.estado !== 'pendiente') throw httpError(409, `La factura ${factura.numero} ya no está pendiente de pago`);
    const { rows } = await client.query(
      'SELECT COUNT(*)::int AS total FROM facturas_plataforma_comprobantes WHERE factura_id = $1',
      [factura.id]
    );
    if (rows[0].total >= MAX_COMPROBANTES) throw httpError(409, 'Esta factura ya tiene muchos comprobantes; escríbenos por WhatsApp');
    await client.query(
      `INSERT INTO facturas_plataforma_comprobantes
       (factura_id, organization_id, archivo, mime, nombre_archivo, referencia, fecha_pago, nota, subido_por, subido_por_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [factura.id, req.organization.id, archivo.buffer, archivo.mime, nombreArchivo, referencia, fechaPago, nota,
        req.user.id, nombreDe(req.user)]
    );
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: `Comprobante recibido para la factura ${factura.numero}. Te avisamos aquí cuando lo confirmemos.`
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    sendError(res, error, 'Error subiendo el comprobante');
  } finally {
    if (client) client.release();
  }
};

/** GET /api/suscripcion/facturas/:id/pdf */
const pdfFactura = async (req, res) => {
  try {
    await facturaDeLaEmpresa(authPool, req);
    const { rows } = await authPool.query(`${FACTURA_SELECT} WHERE f.id = $1`, [Number(req.params.id)]);
    const pdf = await generarFactura(rows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].numero}.pdf"`);
    res.send(pdf);
  } catch (error) {
    sendError(res, error, 'Error generando el PDF de la factura');
  }
};

/** GET /api/suscripcion/comprobantes/:id — el archivo que subió la propia empresa. */
const verComprobante = async (req, res) => {
  try {
    const { rows } = await authPool.query(
      'SELECT mime, archivo FROM facturas_plataforma_comprobantes WHERE id = $1 AND organization_id = $2',
      [Number(req.params.id), req.organization.id]
    );
    if (!rows[0]) throw httpError(404, 'Comprobante no encontrado');
    res.set({ 'Content-Type': rows[0].mime, 'Cache-Control': 'private, no-cache', 'Content-Disposition': 'inline' });
    res.send(rows[0].archivo);
  } catch (error) {
    sendError(res, error, 'Error obteniendo el comprobante');
  }
};

module.exports = { resumen, elegirFormaPago, subirComprobante, pdfFactura, verComprobante, fecha };
