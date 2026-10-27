const authPool = require('../db/authConnection');
const { enviarCorreo } = require('./email');
const plantillas = require('./plantillasCorreo');
const { generarDocumentos } = require('./pdfContrato');
const { MODULE_KEYS } = require('./modules');

// Documentos de contratación que soporte envía al crear una empresa con «Enviar contrato».
// El número se asigna dentro de la transacción del alta; los PDF se generan y envían al terminar.

const PREFIJO = 'BE';
const DOCUMENTOS = ['Propuesta comercial (COT)', 'Contrato de licencia de uso (CTR)', 'Anexo A · Alcance técnico y niveles de servicio (ANX)', 'Acta de entrega y puesta en marcha (ACT)'];
// Bloqueo de transacción para asignar correlativos sin repetir (clave fija de esta tabla).
const BLOQUEO_CORRELATIVO = 7302611;

const contratoError = (message) => Object.assign(new Error(message), { status: 400, expose: true });

// Fecha de hoy en Guatemala como { anio, mes, dia }.
const hoyEnGuatemala = () => {
  const [anio, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' })
    .format(new Date()).split('-').map(Number);
  return { anio, mes, dia };
};

const parseFecha = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [anio, mes, dia] = match.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia ? { anio, mes, dia } : null;
};

/**
 * Valida los datos comerciales del formulario. Devuelve null si no se pidió enviar contrato.
 * Lanza un error expuesto si algún dato no es válido.
 */
const leerContrato = (body) => {
  const contrato = body.contrato;
  if (!contrato || contrato.enviar !== true) return null;
  const mensualidad = Math.round(Number(contrato.mensualidad) * 100) / 100;
  if (!Number.isFinite(mensualidad) || mensualidad <= 0 || mensualidad > 1000000) {
    throw contratoError('La mensualidad debe ser mayor que cero');
  }
  const puntosVenta = Number(contrato.puntosVenta);
  if (!Number.isInteger(puntosVenta) || puntosVenta < 1 || puntosVenta > 100) {
    throw contratoError('Los puntos de venta deben estar entre 1 y 100');
  }
  const inicioCobro = parseFecha(contrato.inicioCobro);
  if (!inicioCobro) throw contratoError('La fecha de inicio del cobro no es válida');
  const modulos = Array.isArray(contrato.modulos) ? [...new Set(contrato.modulos)] : [];
  if (modulos.some((key) => !MODULE_KEYS.has(key))) throw contratoError('Módulo no válido en el contrato');
  const fel = contrato.fel === true;
  if (modulos.length === 0 && !fel) throw contratoError('Marca al menos un módulo para el contrato');
  return {
    mensualidad,
    puntosVenta,
    inicioCobro,
    modulos,
    fel,
    certificador: String(contrato.certificador || '').trim().slice(0, 100)
  };
};

/**
 * Asigna el número BE-<año>-<correlativo> y guarda los datos de los documentos.
 * client: conexión con la transacción del alta abierta.
 */
const registrarContrato = async (client, { organizationId, contrato, cliente, usuarios }) => {
  const fecha = hoyEnGuatemala();
  await client.query('SELECT pg_advisory_xact_lock($1)', [BLOQUEO_CORRELATIVO]);
  const { rows } = await client.query(
    'SELECT COALESCE(MAX(correlativo), 0) + 1 AS siguiente FROM contratos WHERE anio = $1',
    [fecha.anio]
  );
  const correlativo = rows[0].siguiente;
  const numero = `${PREFIJO}-${fecha.anio}-${String(correlativo).padStart(4, '0')}`;
  const datos = { numero, fecha, cliente, usuarios, ...contrato };
  const insert = await client.query(
    `INSERT INTO contratos (organization_id, anio, correlativo, numero, datos)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [organizationId, fecha.anio, correlativo, numero, datos]
  );
  return { id: insert.rows[0].id, datos };
};

// Genera los PDF y los envía al correo del cliente; marca el contrato como enviado.
const enviarDocumentos = async ({ id, datos }) => {
  const adjuntos = await generarDocumentos(datos);
  const correo = plantillas.documentosContrato({
    nombre: datos.cliente.contacto,
    empresa: datos.cliente.nombre,
    numero: datos.numero,
    documentos: DOCUMENTOS
  });
  await enviarCorreo({
    para: datos.cliente.correo,
    nombre: datos.cliente.contacto,
    asunto: correo.asunto,
    html: correo.html,
    texto: correo.texto,
    adjuntos
  });
  await authPool.query('UPDATE contratos SET enviado_en = NOW() WHERE id = $1', [id]);
};

module.exports = { leerContrato, registrarContrato, enviarDocumentos };
