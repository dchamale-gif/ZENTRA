const authPool = require('../db/authConnection');
const { enviarCorreo } = require('../utils/email');
const plantillas = require('../utils/plantillasCorreo');
const { generarFactura, nombrePeriodo, partesFecha } = require('../utils/pdfFactura');
const { maquetacion } = require('../utils/pdfContrato');

// Facturas que BotEngine emite a sus clientes desde el panel de soporte. Numeración propia
// F-<año>-<correlativo>; "vencida" no se guarda: es una pendiente con la fecha de pago pasada.

const PREFIJO = 'F';
// Bloqueo de transacción para asignar correlativos sin repetir (clave fija de esta tabla).
const BLOQUEO_CORRELATIVO = 7302612;
const METODOS_PAGO = new Set(['transferencia', 'deposito', 'efectivo', 'tarjeta', 'cheque', 'otro']);
const { dinero, fechaCorta } = maquetacion;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (error.code === '23505') {
    return res.status(409).json({ error: 'Esa empresa ya tiene una mensualidad para ese mes; anúlala antes de crear otra' });
  }
  if (!error.expose) console.error(fallback, error);
  res.status(error.status || 500).json({ error: error.expose ? error.message : fallback });
};

// Hoy en Guatemala como 'YYYY-MM-DD'.
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());

const sumarDias = (fecha, dias) => {
  const date = new Date(`${fecha}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dias);
  return date.toISOString().slice(0, 10);
};

const esFecha = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

// 'YYYY-MM' → 'YYYY-MM-01', o null si no es válido.
const leerPeriodo = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return `${match[1]}-${match[2]}-01`;
};

const leerItems = (items) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    throw httpError(400, 'Agrega entre 1 y 20 conceptos a la factura');
  }
  return items.map((item) => {
    const descripcion = String(item?.descripcion || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    const cantidad = Number(item?.cantidad);
    const precio = Math.round(Number(item?.precio) * 100) / 100;
    if (!descripcion) throw httpError(400, 'Cada concepto necesita una descripción');
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 10000) throw httpError(400, `La cantidad de «${descripcion}» no es válida`);
    if (!Number.isFinite(precio) || precio <= 0 || precio > 1000000) throw httpError(400, `El precio de «${descripcion}» debe ser mayor que cero`);
    return { descripcion, cantidad, precio };
  });
};

const totalDe = (items) => Math.round(items.reduce((suma, item) => suma + item.cantidad * item.precio, 0) * 100) / 100;

const FACTURA_SELECT = `
  SELECT f.*, o.nombre AS empresa_nombre, o.nit AS empresa_nit, o.email AS empresa_email,
         o.direccion AS empresa_direccion,
         (f.estado = 'pendiente' AND f.fecha_vencimiento < (NOW() AT TIME ZONE 'America/Guatemala')::DATE) AS vencida
  FROM facturas_plataforma f
  JOIN organizations o ON o.id = f.organization_id`;

const fecha = (value) => (value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : null);

const mapFactura = (row) => ({
  id: row.id,
  numero: row.numero,
  organizationId: row.organization_id,
  empresa: row.empresa_nombre,
  empresaEmail: row.empresa_email,
  periodo: fecha(row.periodo),
  items: row.items,
  total: Number(row.total),
  fechaEmision: fecha(row.fecha_emision),
  fechaVencimiento: fecha(row.fecha_vencimiento),
  estado: row.vencida ? 'vencida' : row.estado,
  pagadaEn: fecha(row.pagada_en),
  metodoPago: row.metodo_pago,
  referenciaPago: row.referencia_pago,
  enviadaEn: row.enviada_en,
  enviadaA: row.enviada_a
});

/**
 * Inserta una factura con el siguiente correlativo del año. client: conexión con transacción.
 */
const insertarFactura = async (client, { organizationId, items, periodo, fechaEmision, fechaVencimiento, adminId }) => {
  const anio = Number(fechaEmision.slice(0, 4));
  await client.query('SELECT pg_advisory_xact_lock($1)', [BLOQUEO_CORRELATIVO]);
  const { rows } = await client.query(
    'SELECT COALESCE(MAX(correlativo), 0) + 1 AS siguiente FROM facturas_plataforma WHERE anio = $1',
    [anio]
  );
  const correlativo = rows[0].siguiente;
  const result = await client.query(
    `INSERT INTO facturas_plataforma
     (organization_id, anio, correlativo, numero, periodo, items, total, fecha_emision, fecha_vencimiento, creada_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [organizationId, anio, correlativo, `${PREFIJO}-${anio}-${String(correlativo).padStart(4, '0')}`,
      periodo, JSON.stringify(items), totalDe(items), fechaEmision, fechaVencimiento, adminId]
  );
  return result.rows[0].id;
};

const obtenerFactura = async (id) => {
  const { rows } = await authPool.query(`${FACTURA_SELECT} WHERE f.id = $1`, [id]);
  if (!rows[0]) throw httpError(404, 'Factura no encontrada');
  return rows[0];
};

// Genera el PDF y lo envía al correo de la empresa (o al indicado). Marca la factura como enviada.
const enviarFactura = async (id, para) => {
  const factura = await obtenerFactura(id);
  if (factura.estado === 'anulada') throw httpError(409, 'La factura está anulada; no se puede enviar');
  const destino = String(para || factura.empresa_email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) throw httpError(400, 'La empresa no tiene un correo válido; escribe uno');
  const pdf = await generarFactura(factura);
  const correo = plantillas.factura({
    nombre: factura.empresa_nombre,
    empresa: factura.empresa_nombre,
    numero: factura.numero,
    concepto: factura.items.map((item) => item.descripcion).join(' · '),
    total: dinero(Number(factura.total)),
    vence: fechaCorta(partesFecha(factura.fecha_vencimiento)),
    vencida: factura.vencida === true
  });
  await enviarCorreo({
    para: destino,
    nombre: factura.empresa_nombre,
    asunto: correo.asunto,
    html: correo.html,
    texto: correo.texto,
    adjuntos: [{ nombre: `${factura.numero}.pdf`, contenido: pdf }]
  });
  await authPool.query(
    'UPDATE facturas_plataforma SET enviada_en = NOW(), enviada_a = $1, updated_at = NOW() WHERE id = $2',
    [destino, id]
  );
  return { destino, recordatorio: factura.vencida === true };
};

const listarFacturas = async (req, res) => {
  try {
    const filtros = [];
    const params = [];
    if (req.query.organizationId) {
      params.push(Number(req.query.organizationId));
      filtros.push(`f.organization_id = $${params.length}`);
    }
    const estado = String(req.query.estado || '');
    if (estado === 'vencida') {
      filtros.push(`f.estado = 'pendiente' AND f.fecha_vencimiento < (NOW() AT TIME ZONE 'America/Guatemala')::DATE`);
    } else if (['pendiente', 'pagada', 'anulada'].includes(estado)) {
      params.push(estado);
      filtros.push(`f.estado = $${params.length}`);
    }
    const { rows } = await authPool.query(
      `${FACTURA_SELECT} ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
       ORDER BY f.fecha_emision DESC, f.id DESC LIMIT 500`,
      params
    );
    res.json({ success: true, facturas: rows.map(mapFactura) });
  } catch (error) {
    sendError(res, error, 'Error obteniendo facturas');
  }
};

const crearFactura = async (req, res) => {
  let client;
  try {
    const organizationId = Number(req.body.organizationId);
    const items = leerItems(req.body.items);
    const fechaEmision = esFecha(req.body.fechaEmision) ? req.body.fechaEmision : hoy();
    const fechaVencimiento = esFecha(req.body.fechaVencimiento) ? req.body.fechaVencimiento : sumarDias(fechaEmision, 10);
    if (fechaVencimiento < fechaEmision) throw httpError(400, 'La fecha de pago no puede ser anterior a la de emisión');
    const periodo = req.body.periodo ? leerPeriodo(req.body.periodo) : null;
    if (req.body.periodo && !periodo) throw httpError(400, 'El mes de la mensualidad no es válido');

    client = await authPool.connect();
    await client.query('BEGIN');
    const org = await client.query('SELECT id FROM organizations WHERE id = $1', [organizationId]);
    if (!org.rows[0]) throw httpError(404, 'Empresa no encontrada');
    const id = await insertarFactura(client, {
      organizationId, items, periodo, fechaEmision, fechaVencimiento, adminId: req.platformAdmin.id
    });
    await client.query('COMMIT');
    client.release();
    client = null;

    let envio = null;
    if (req.body.enviar === true) {
      try {
        envio = { enviado: true, ...(await enviarFactura(id, req.body.para)) };
      } catch (error) {
        envio = { enviado: false, error: error.expose ? error.message : 'No se pudo enviar el correo' };
        if (!error.expose) console.error('Error enviando factura:', error);
      }
    }
    const factura = mapFactura(await obtenerFactura(id));
    res.status(201).json({
      success: true,
      factura,
      message: `Factura ${factura.numero} creada por ${dinero(factura.total)}.` + (!envio ? ''
        : envio.enviado ? ` Enviada a ${envio.destino}.` : ` No se envió: ${envio.error}.`),
      envio
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    sendError(res, error, 'Error creando la factura');
  }
};

// Crea la mensualidad del mes para cada empresa activa con cuota que aún no la tenga.
const generarMensualidades = async (req, res) => {
  let client;
  try {
    const periodo = leerPeriodo(req.body.periodo);
    if (!periodo) throw httpError(400, 'Indica el mes a facturar (AAAA-MM)');
    const diasCredito = Number(req.body.diasCredito ?? 10);
    if (!Number.isInteger(diasCredito) || diasCredito < 0 || diasCredito > 90) {
      throw httpError(400, 'Los días para pagar deben estar entre 0 y 90');
    }
    const fechaEmision = hoy();
    const fechaVencimiento = sumarDias(fechaEmision, diasCredito);

    client = await authPool.connect();
    await client.query('BEGIN');
    const { rows: empresas } = await client.query(
      `SELECT o.id, o.nombre, o.cuota_mensual FROM organizations o
       WHERE o.subscription_status = 'active' AND o.cuota_mensual > 0
         AND NOT EXISTS (SELECT 1 FROM facturas_plataforma f
                         WHERE f.organization_id = o.id AND f.periodo = $1 AND f.estado <> 'anulada')
       ORDER BY o.nombre`,
      [periodo]
    );
    const ids = [];
    for (const empresa of empresas) {
      ids.push(await insertarFactura(client, {
        organizationId: empresa.id,
        items: [{ descripcion: `Licencia de uso BotEngine ERP · ${nombrePeriodo(periodo)}`, cantidad: 1, precio: Number(empresa.cuota_mensual) }],
        periodo,
        fechaEmision,
        fechaVencimiento,
        adminId: req.platformAdmin.id
      }));
    }
    await client.query('COMMIT');
    client.release();
    client = null;

    const fallidas = [];
    if (req.body.enviar === true) {
      for (const id of ids) {
        try {
          await enviarFactura(id);
        } catch (error) {
          const factura = await obtenerFactura(id).catch(() => null);
          fallidas.push(`${factura?.empresa_nombre || id}: ${error.expose ? error.message : 'no se pudo enviar'}`);
          if (!error.expose) console.error('Error enviando mensualidad:', error);
        }
      }
    }
    const mes = nombrePeriodo(periodo);
    res.json({
      success: true,
      creadas: ids.length,
      message: ids.length === 0
        ? `Todas las empresas activas con cuota ya tienen su factura de ${mes}.`
        : `${ids.length} ${ids.length === 1 ? 'factura creada' : 'facturas creadas'} para ${mes}.` +
          (req.body.enviar === true ? (fallidas.length ? ` No se enviaron: ${fallidas.join('; ')}.` : ' Todas se enviaron por correo.') : ''),
      fallidas
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    sendError(res, error, 'Error generando las mensualidades');
  }
};

const descargarPdf = async (req, res) => {
  try {
    const factura = await obtenerFactura(req.params.id);
    const pdf = await generarFactura(factura);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${factura.numero}.pdf"`);
    res.send(pdf);
  } catch (error) {
    sendError(res, error, 'Error generando el PDF');
  }
};

const reenviarFactura = async (req, res) => {
  try {
    const { destino, recordatorio } = await enviarFactura(req.params.id, req.body.para);
    res.json({ success: true, message: `${recordatorio ? 'Recordatorio de pago enviado' : 'Factura enviada'} a ${destino}` });
  } catch (error) {
    sendError(res, error, 'Error enviando la factura');
  }
};

const registrarPago = async (req, res) => {
  try {
    const metodo = METODOS_PAGO.has(req.body.metodo) ? req.body.metodo : null;
    if (!metodo) throw httpError(400, 'Elige cómo pagó el cliente');
    const fechaPago = esFecha(req.body.fecha) ? req.body.fecha : hoy();
    const referencia = String(req.body.referencia || '').trim().slice(0, 100) || null;
    const { rows } = await authPool.query(
      `UPDATE facturas_plataforma
       SET estado = 'pagada', pagada_en = $1, metodo_pago = $2, referencia_pago = $3, updated_at = NOW()
       WHERE id = $4 AND estado = 'pendiente'
       RETURNING numero`,
      [fechaPago, metodo, referencia, req.params.id]
    );
    if (!rows[0]) throw httpError(409, 'La factura no existe o ya no está pendiente');
    res.json({ success: true, message: `Pago de ${rows[0].numero} registrado` });
  } catch (error) {
    sendError(res, error, 'Error registrando el pago');
  }
};

const anularFactura = async (req, res) => {
  try {
    const { rows } = await authPool.query(
      `UPDATE facturas_plataforma SET estado = 'anulada', updated_at = NOW()
       WHERE id = $1 AND estado = 'pendiente' RETURNING numero`,
      [req.params.id]
    );
    if (!rows[0]) throw httpError(409, 'Solo se anulan facturas pendientes');
    res.json({ success: true, message: `Factura ${rows[0].numero} anulada` });
  } catch (error) {
    sendError(res, error, 'Error anulando la factura');
  }
};

// Indicadores de la cartera para el inicio del panel.
const resumen = async (req, res) => {
  try {
    const { rows } = await authPool.query(
      `SELECT
         (SELECT COUNT(*) FROM organizations WHERE subscription_status = 'active')::INTEGER AS activas,
         (SELECT COUNT(*) FROM organizations WHERE subscription_status = 'trial' AND trial_ends_at > NOW())::INTEGER AS en_prueba,
         (SELECT COUNT(*) FROM organizations
          WHERE subscription_status IN ('trial', 'active')
            AND COALESCE(subscription_ends_at, trial_ends_at) BETWEEN NOW() AND NOW() + INTERVAL '15 days')::INTEGER AS por_vencer,
         (SELECT COUNT(*) FROM organizations WHERE subscription_status = 'suspended')::INTEGER AS suspendidas,
         (SELECT COALESCE(SUM(cuota_mensual), 0) FROM organizations WHERE subscription_status = 'active') AS ingreso_mensual,
         (SELECT COUNT(*) FROM organizations WHERE subscription_status = 'active' AND COALESCE(cuota_mensual, 0) = 0)::INTEGER AS activas_sin_cuota,
         COALESCE(SUM(total) FILTER (WHERE estado = 'pendiente'), 0) AS pendiente,
         (COUNT(*) FILTER (WHERE estado = 'pendiente'))::INTEGER AS facturas_pendientes,
         COALESCE(SUM(total) FILTER (WHERE estado = 'pendiente' AND fecha_vencimiento < (NOW() AT TIME ZONE 'America/Guatemala')::DATE), 0) AS vencido,
         (COUNT(*) FILTER (WHERE estado = 'pendiente' AND fecha_vencimiento < (NOW() AT TIME ZONE 'America/Guatemala')::DATE))::INTEGER AS facturas_vencidas,
         COALESCE(SUM(total) FILTER (WHERE estado = 'pagada'
           AND date_trunc('month', pagada_en) = date_trunc('month', (NOW() AT TIME ZONE 'America/Guatemala')::DATE)), 0) AS cobrado_mes
       FROM facturas_plataforma`
    );
    const r = rows[0];
    res.json({
      success: true,
      resumen: {
        activas: r.activas,
        enPrueba: r.en_prueba,
        porVencer: r.por_vencer,
        suspendidas: r.suspendidas,
        ingresoMensual: Number(r.ingreso_mensual),
        activasSinCuota: r.activas_sin_cuota,
        pendiente: Number(r.pendiente),
        facturasPendientes: r.facturas_pendientes,
        vencido: Number(r.vencido),
        facturasVencidas: r.facturas_vencidas,
        cobradoMes: Number(r.cobrado_mes)
      }
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo el resumen');
  }
};

module.exports = {
  listarFacturas,
  crearFactura,
  generarMensualidades,
  descargarPdf,
  reenviarFactura,
  registrarPago,
  anularFactura,
  resumen,
  mapFactura,
  FACTURA_SELECT
};
