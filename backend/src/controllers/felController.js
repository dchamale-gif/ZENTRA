const pool = require('../db/connection');
const { getTenantId } = require('../db/tenantContext');
const { generateId } = require('../utils/helpers');
const { encrypt, decrypt } = require('../utils/secretBox');
const { generarFactura, generarAnulacion, FRASES_POR_DEFECTO } = require('../utils/fel/dte');
const { nitValido, normalizarReceptor } = require('../utils/fel/identificacion');
const { CATALOGO, obtenerConector } = require('../utils/fel/certificadores');

// Facturación electrónica (FEL). Cada empresa configura su emisor, su régimen de IVA y su
// certificador; al cobrar se elige ticket (sin FEL) o factura (se certifica en ese momento).
const TIPO = 'fel';
const AFILIACIONES = new Set(['GEN', 'PEQ']);
const AMBIENTES = new Set(['pruebas', 'produccion']);

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (error.expose || (error.status && error.status < 500)) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
};

const NO_HABILITADA = 'La facturación electrónica no está habilitada para tu empresa; pide a soporte que la active';

// Soporte habilita FEL por empresa (organizations.fel_habilitada, viene en req.organization).
const requireHabilitada = (req, res, next) => {
  if (req.organization?.felHabilitada) return next();
  res.status(403).json({ error: NO_HABILITADA, code: 'FEL_DISABLED' });
};

const text = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

const loadConfig = async (db = pool) => {
  const result = await db.query(
    'SELECT activa, config, secreto FROM integraciones WHERE tipo = $1', [TIPO]
  );
  return result.rows[0] || null;
};

const credencialesDe = (row) => {
  if (!row?.secreto) return {};
  try {
    return JSON.parse(decrypt(row.secreto, getTenantId()));
  } catch (error) {
    if (error.status) throw error;
    throw httpError(400, 'Las credenciales del certificador ya no se pueden leer; escríbelas de nuevo en Configuración → Facturación');
  }
};

// Resumen que necesitan el punto de venta y Ventas para ofrecer «Factura».
const estadoPublico = (row) => ({
  activa: Boolean(row?.activa),
  comprobantePorDefecto: row?.config?.comprobantePorDefecto === 'factura' ? 'factura' : 'ticket',
  afiliacionIVA: row?.config?.emisor?.afiliacionIVA || null,
  certificador: row?.config?.certificador || null,
  ambiente: row?.config?.ambiente || null
});

const normalizeConfig = (body) => {
  const emisor = body.emisor || {};
  const direccion = emisor.direccion || {};
  const config = {
    certificador: text(body.certificador, 30),
    ambiente: text(body.ambiente, 12) || 'pruebas',
    comprobantePorDefecto: body.comprobantePorDefecto === 'factura' ? 'factura' : 'ticket',
    emisor: {
      nit: text(emisor.nit, 13).toUpperCase().replace(/-/g, ''),
      nombre: text(emisor.nombre, 400),
      nombreComercial: text(emisor.nombreComercial, 255),
      codigoEstablecimiento: Number(emisor.codigoEstablecimiento) || 1,
      afiliacionIVA: text(emisor.afiliacionIVA, 3).toUpperCase(),
      correo: text(emisor.correo, 120) || null,
      direccion: {
        direccion: text(direccion.direccion, 200),
        codigoPostal: text(direccion.codigoPostal, 10) || '01001',
        municipio: text(direccion.municipio, 100),
        departamento: text(direccion.departamento, 100),
        pais: 'GT'
      },
      frases: Array.isArray(emisor.frases) ? emisor.frases.slice(0, 10).map((frase) => ({
        tipo: Number(frase.tipo), escenario: Number(frase.escenario)
      })) : null
    }
  };
  const e = config.emisor;
  if (!CATALOGO.some((entry) => entry.id === config.certificador)) throw httpError(400, 'Elige un certificador');
  if (!AMBIENTES.has(config.ambiente)) throw httpError(400, 'El ambiente debe ser pruebas o producción');
  if (!nitValido(e.nit)) throw httpError(400, 'El NIT del emisor no es válido: revisa el dígito verificador');
  if (!e.nombre) throw httpError(400, 'Escribe el nombre o razón social del emisor, como aparece en el RTU');
  if (!e.nombreComercial) throw httpError(400, 'Escribe el nombre comercial del establecimiento');
  if (!Number.isInteger(e.codigoEstablecimiento) || e.codigoEstablecimiento < 1 || e.codigoEstablecimiento > 9999) {
    throw httpError(400, 'El código de establecimiento debe ser un número entre 1 y 9999 (lo ves en tu RTU)');
  }
  if (!AFILIACIONES.has(e.afiliacionIVA)) throw httpError(400, 'Elige el régimen de IVA: general o pequeño contribuyente');
  if (e.correo && !/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(e.correo)) throw httpError(400, 'El correo del emisor no es válido');
  if (!e.direccion.direccion || !e.direccion.municipio || !e.direccion.departamento) {
    throw httpError(400, 'Completa la dirección del establecimiento: dirección, municipio y departamento');
  }
  if (!/^\d{5}$/.test(e.direccion.codigoPostal)) throw httpError(400, 'El código postal debe tener 5 dígitos');
  if (e.frases && !e.frases.every((f) => Number.isInteger(f.tipo) && f.tipo >= 1 && f.tipo <= 12
      && Number.isInteger(f.escenario) && f.escenario >= 1 && f.escenario <= 99)) {
    throw httpError(400, 'Las frases deben indicar tipo (1-12) y escenario (1-99)');
  }
  if (!e.frases?.length) e.frases = null;
  return config;
};

const getConfig = async (req, res) => {
  try {
    const row = await loadConfig();
    const credenciales = row ? credencialesDe(row) : {};
    res.status(200).json({
      success: true,
      fel: {
        configurada: Boolean(row),
        ...estadoPublico(row),
        config: row?.config || null,
        // Solo se dice qué credenciales hay guardadas, nunca su valor.
        credencialesGuardadas: Object.keys(credenciales).filter((key) => credenciales[key]),
        catalogo: CATALOGO,
        frasesPorDefecto: FRASES_POR_DEFECTO,
        habilitada: Boolean(process.env.INTEGRATIONS_KEY && process.env.INTEGRATIONS_KEY.length >= 32)
      }
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo la configuración de facturación');
  }
};

const saveConfig = async (req, res) => {
  try {
    const config = normalizeConfig(req.body);
    const row = await loadConfig();
    const campos = CATALOGO.find((entry) => entry.id === config.certificador).campos;
    const anteriores = row?.config?.certificador === config.certificador ? credencialesDe(row) : {};
    const credenciales = {};
    for (const campo of campos) {
      const nuevo = String(req.body.credenciales?.[campo.id] ?? '').trim();
      credenciales[campo.id] = nuevo || anteriores[campo.id] || '';
    }
    const secreto = campos.length ? encrypt(JSON.stringify(credenciales), getTenantId()) : null;
    await pool.query(
      `INSERT INTO integraciones (tipo, activa, config, secreto, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (organization_id, tipo) DO UPDATE
       SET activa = EXCLUDED.activa, config = EXCLUDED.config, secreto = EXCLUDED.secreto, updated_at = NOW()`,
      [TIPO, req.body.activa !== false, config, secreto]
    );
    await getConfig(req, res);
  } catch (error) {
    sendError(res, error, 'Error guardando la configuración de facturación');
  }
};

const getEstado = async (req, res) => {
  try {
    const estado = req.organization?.felHabilitada ? estadoPublico(await loadConfig()) : estadoPublico(null);
    res.status(200).json({ success: true, fel: { ...estado, habilitadaPorSoporte: Boolean(req.organization?.felHabilitada) } });
  } catch (error) {
    sendError(res, error, 'Error obteniendo el estado de facturación');
  }
};

// Revisa antes de cobrar que la factura se podrá emitir (configuración y receptor).
const prepararFactura = async (receptorInput, felHabilitada) => {
  if (!felHabilitada) throw httpError(403, NO_HABILITADA);
  const row = await loadConfig();
  if (!row?.activa) throw httpError(400, 'La facturación electrónica no está activa; configúrala en Configuración → Facturación');
  obtenerConector(row.config.certificador);
  return { row, receptor: normalizarReceptor(receptorInput) };
};

const DOCUMENTO_PUBLICO = `id, venta_id, tipo_dte, estado, certificador, ambiente, receptor_id, receptor_tipo,
  receptor_nombre, total, fecha_emision, uuid, serie, numero, fecha_certificacion, error,
  anulacion_motivo, anulado_at, created_at`;

/**
 * Emite y certifica la factura de una venta ya registrada. Si el certificador la rechaza o no
 * responde, la venta queda igual y el documento queda con estado «error» para reintentar.
 */
const emitirFactura = async (ventaId, receptorInput, userId, felHabilitada) => {
  const { row, receptor } = await prepararFactura(receptorInput, felHabilitada);
  const { config } = row;

  const venta = await pool.query('SELECT id, total, estado FROM ventas WHERE id = $1', [ventaId]);
  if (!venta.rows[0]) throw httpError(404, 'Venta no encontrada');
  const lineas = await pool.query(
    `SELECT vi.cantidad, vi.precio_unitario, COALESCE(a.nombre_articulo, m.nombre, 'Producto') AS descripcion,
            CASE WHEN lower(COALESCE(a.tipo, '')) LIKE 'servicio%' THEN 'S' ELSE 'B' END AS bien_o_servicio
     FROM venta_items vi
     LEFT JOIN codigos_articulos a ON a.id = vi.articulo_id
     LEFT JOIN medicinas m ON m.id = vi.medicina_id
     WHERE vi.venta_id = $1 ORDER BY vi.created_at, vi.id`,
    [ventaId]
  );
  const fechaEmision = new Date();
  const { xml, tipo, granTotal } = generarFactura({
    emisor: { ...config.emisor },
    receptor,
    fechaEmision,
    items: lineas.rows.map((linea) => ({
      cantidad: Number(linea.cantidad),
      precioUnitario: Number(linea.precio_unitario),
      descripcion: linea.descripcion,
      bienOServicio: linea.bien_o_servicio
    }))
  });

  // Reservar la venta: el índice único impide dos facturas vigentes a la vez.
  const id = generateId('FEL');
  try {
    await pool.query(
      `INSERT INTO fel_documentos
       (id, venta_id, tipo_dte, estado, certificador, ambiente, receptor_id, receptor_tipo,
        receptor_nombre, total, fecha_emision, xml_enviado, user_id)
       VALUES ($1, $2, $3, 'pendiente', $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, ventaId, tipo, config.certificador, config.ambiente, receptor.id, receptor.tipo,
        receptor.nombre, granTotal, fechaEmision, xml, userId]
    );
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'Esta venta ya tiene una factura vigente o en proceso');
    throw error;
  }

  try {
    const conector = obtenerConector(config.certificador);
    const resultado = await conector.certificar({
      xml, emisor: config.emisor, credenciales: credencialesDe(row), ambiente: config.ambiente, referencia: id
    });
    await pool.query(
      `UPDATE fel_documentos SET estado = 'certificado', uuid = $2, serie = $3, numero = $4,
       fecha_certificacion = $5, xml_certificado = $6, updated_at = NOW() WHERE id = $1`,
      [id, resultado.uuid, resultado.serie, resultado.numero, resultado.fechaCertificacion, resultado.xmlCertificado]
    );
  } catch (error) {
    const mensaje = error.expose ? error.message : 'El certificador no respondió; intenta de nuevo en unos minutos';
    if (!error.expose) console.error('Error certificando FEL:', error);
    await pool.query(
      `UPDATE fel_documentos SET estado = 'error', error = $2, updated_at = NOW() WHERE id = $1`,
      [id, mensaje]
    );
  }
  const documento = await pool.query(`SELECT ${DOCUMENTO_PUBLICO} FROM fel_documentos WHERE id = $1`, [id]);
  return documento.rows[0];
};

const emitir = async (req, res) => {
  try {
    const documento = await emitirFactura(req.params.ventaId, req.body.receptor, req.user.id, req.organization.felHabilitada);
    res.status(documento.estado === 'certificado' ? 201 : 502).json({
      success: documento.estado === 'certificado',
      documento,
      ...(documento.estado === 'error' ? { error: documento.error } : {})
    });
  } catch (error) {
    sendError(res, error, 'Error emitiendo la factura');
  }
};

const anular = async (req, res) => {
  try {
    const motivo = text(req.body.motivo, 255);
    if (!motivo) throw httpError(400, 'Escribe el motivo de la anulación');
    const row = await loadConfig();
    if (!row) throw httpError(400, 'La facturación electrónica no está configurada');
    const result = await pool.query(
      'SELECT id, estado, uuid, receptor_id, fecha_emision, certificador, ambiente FROM fel_documentos WHERE id = $1',
      [req.params.id]
    );
    const documento = result.rows[0];
    if (!documento) throw httpError(404, 'Factura no encontrada');
    if (documento.estado !== 'certificado') throw httpError(409, 'Solo se puede anular una factura certificada');

    const xml = generarAnulacion({
      emisorNit: row.config.emisor.nit,
      uuid: documento.uuid,
      receptorId: documento.receptor_id,
      fechaEmisionDocumento: documento.fecha_emision,
      motivo
    });
    // Se anula con el mismo certificador y ambiente con que se emitió.
    const conector = obtenerConector(documento.certificador);
    const resultado = await conector.anular({
      xml, emisor: row.config.emisor, credenciales: credencialesDe(row), ambiente: documento.ambiente, referencia: documento.id
    });
    await pool.query(
      `UPDATE fel_documentos SET estado = 'anulado', anulacion_motivo = $2, anulado_at = $3,
       xml_anulacion = $4, updated_at = NOW() WHERE id = $1`,
      [documento.id, motivo, resultado.fechaCertificacion, resultado.xmlCertificado]
    );
    const actualizado = await pool.query(`SELECT ${DOCUMENTO_PUBLICO} FROM fel_documentos WHERE id = $1`, [documento.id]);
    res.status(200).json({ success: true, documento: actualizado.rows[0] });
  } catch (error) {
    sendError(res, error, 'Error anulando la factura');
  }
};

const getXml = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT serie, numero, estado, xml_enviado, xml_certificado, xml_anulacion FROM fel_documentos WHERE id = $1',
      [req.params.id]
    );
    const documento = result.rows[0];
    if (!documento) throw httpError(404, 'Factura no encontrada');
    const anulacion = req.query.tipo === 'anulacion';
    const xml = anulacion ? documento.xml_anulacion : (documento.xml_certificado || documento.xml_enviado);
    if (!xml) throw httpError(404, 'Ese XML no existe para esta factura');
    const nombre = `${anulacion ? 'anulacion' : 'factura'}-${documento.serie || 'sin-certificar'}-${documento.numero || req.params.id}.xml`;
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`
    });
    res.status(200).send(xml);
  } catch (error) {
    sendError(res, error, 'Error descargando el XML');
  }
};

module.exports = {
  getConfig, saveConfig, getEstado, emitir, anular, getXml, prepararFactura, emitirFactura, requireHabilitada
};
