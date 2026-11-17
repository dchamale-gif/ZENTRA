// Conector de INFILE (FEEL). Dos pasos por documento:
//   1. Firma: el servicio de firma de INFILE firma el XML con el alias y la llave de firma del emisor.
//   2. Certificación (o anulación): se envía el XML firmado con el usuario y la llave API.
// El ambiente de pruebas usa los mismos servicios: lo define la cuenta (credenciales de pruebas).
// Las direcciones se pueden cambiar con variables de entorno si INFILE entrega otras.

const URLS = {
  firma: process.env.INFILE_URL_FIRMA || 'https://signer-emisores.feel.com.gt/sign_solicitud_firmas/firma_xml',
  certificacion: process.env.INFILE_URL_CERTIFICACION || 'https://certificador.feel.com.gt/fel/certificacion/v2/dte/',
  anulacion: process.env.INFILE_URL_ANULACION || 'https://certificador.feel.com.gt/fel/anulacion/v2/dte/'
};
const TIEMPO_MAXIMO_MS = 30000;

const fallo = (status, message) => Object.assign(new Error(message), { status, expose: true });

const base64 = (texto) => Buffer.from(texto, 'utf8').toString('base64');
const desdeBase64 = (texto) => Buffer.from(String(texto || ''), 'base64').toString('utf8');

const revisarCredenciales = (credenciales = {}) => {
  const faltan = [
    ['usuarioFirma', 'usuario de firma (alias)'],
    ['llaveFirma', 'llave de firma'],
    ['usuarioApi', 'usuario API'],
    ['llaveApi', 'llave API']
  ].filter(([campo]) => !String(credenciales[campo] || '').trim()).map(([, nombre]) => nombre);
  if (faltan.length) {
    throw fallo(400, `Faltan credenciales de INFILE: ${faltan.join(', ')}. Escríbelas en Configuración → Facturación`);
  }
};

const llamar = async (url, { headers = {}, body }) => {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS)
    });
  } catch (error) {
    throw fallo(502, 'INFILE no respondió; intenta de nuevo en unos minutos');
  }
  const texto = await respuesta.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (error) {
    console.error(`INFILE respondió ${respuesta.status} sin JSON:`, texto.slice(0, 500));
    throw fallo(502, `INFILE respondió con un error (${respuesta.status}); intenta de nuevo en unos minutos`);
  }
  if (respuesta.status === 401 || respuesta.status === 403) {
    throw fallo(422, 'INFILE rechazó las credenciales: revisa el usuario y la llave API en Configuración → Facturación');
  }
  return datos;
};

// Mensaje claro con los errores que devuelve INFILE o la SAT.
const mensajeDeErrores = (datos, accion) => {
  const errores = Array.isArray(datos.descripcion_errores) ? datos.descripcion_errores : [];
  const detalle = errores
    .map((error) => [error.fuente, error.mensaje_error].filter(Boolean).join(': '))
    .filter(Boolean)
    .slice(0, 5)
    .join(' · ');
  return `INFILE no ${accion} el documento: ${detalle || datos.descripcion || 'sin detalle del error'}`;
};

const firmar = async ({ xml, credenciales, referencia, anulacion }) => {
  const datos = await llamar(URLS.firma, {
    body: {
      llave: credenciales.llaveFirma,
      archivo: base64(xml),
      codigo: referencia,
      alias: credenciales.usuarioFirma,
      es_anulacion: anulacion ? 'S' : 'N'
    }
  });
  if (datos.resultado !== true || !datos.archivo) {
    throw fallo(422, `INFILE no pudo firmar el documento: ${datos.descripcion || 'revisa el usuario y la llave de firma'}`);
  }
  return datos.archivo;
};

const enviar = async ({ url, xmlFirmado, emisor, credenciales, referencia, accion }) => {
  const datos = await llamar(url, {
    headers: {
      UsuarioFirma: credenciales.usuarioFirma,
      LlaveFirma: credenciales.llaveFirma,
      UsuarioApi: credenciales.usuarioApi,
      LlaveApi: credenciales.llaveApi,
      identificador: referencia
    },
    body: {
      nit_emisor: emisor.nit,
      correo_copia: emisor.correo || '',
      xml_dte: xmlFirmado
    }
  });
  if (datos.resultado !== true) throw fallo(422, mensajeDeErrores(datos, accion));
  return datos;
};

const fechaDe = (texto) => {
  const fecha = texto ? new Date(texto) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha : new Date();
};

const certificar = async ({ xml, emisor, credenciales, referencia }) => {
  revisarCredenciales(credenciales);
  const xmlFirmado = await firmar({ xml, credenciales, referencia, anulacion: false });
  const datos = await enviar({ url: URLS.certificacion, xmlFirmado, emisor, credenciales, referencia, accion: 'certificó' });
  if (!datos.uuid) throw fallo(502, 'INFILE certificó sin devolver el número de autorización; revisa la factura en el portal de INFILE');
  return {
    uuid: String(datos.uuid).toUpperCase(),
    serie: datos.serie,
    numero: String(datos.numero),
    fechaCertificacion: fechaDe(datos.fecha),
    xmlCertificado: datos.xml_certificado ? desdeBase64(datos.xml_certificado) : desdeBase64(xmlFirmado)
  };
};

const anular = async ({ xml, emisor, credenciales, referencia }) => {
  revisarCredenciales(credenciales);
  // El identificador debe ser distinto al de la factura: INFILE lo usa para no repetir envíos.
  const identificador = `${referencia}-ANU`;
  const xmlFirmado = await firmar({ xml, credenciales, referencia: identificador, anulacion: true });
  const datos = await enviar({ url: URLS.anulacion, xmlFirmado, emisor, credenciales, referencia: identificador, accion: 'anuló' });
  return {
    fechaCertificacion: fechaDe(datos.fecha),
    xmlCertificado: datos.xml_certificado ? desdeBase64(datos.xml_certificado) : desdeBase64(xmlFirmado)
  };
};

module.exports = { certificar, anular, URLS };
