// Conector de INFILE (FEEL) con el proceso unificado: una sola petición con el XML sin firmar;
// INFILE lo firma con el alias y la llave de firma y lo certifica (o anula) con el usuario y la
// llave API. La misma dirección sirve para facturas y anulaciones, y para pruebas y producción:
// el ambiente lo define la cuenta (credenciales de pruebas). Se puede cambiar con INFILE_URL.

const URL_TRANSACCION = process.env.INFILE_URL || 'https://certificador.feel.com.gt/fel/procesounificado/transaccion/v2/xml';
const TIEMPO_MAXIMO_MS = 30000;

const fallo = (status, message) => Object.assign(new Error(message), { status, expose: true });

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

const transaccion = async ({ xml, credenciales, identificador, accion }) => {
  revisarCredenciales(credenciales);
  let respuesta;
  try {
    respuesta = await fetch(URL_TRANSACCION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        Accept: 'application/json',
        UsuarioFirma: credenciales.usuarioFirma,
        LlaveFirma: credenciales.llaveFirma,
        UsuarioApi: credenciales.usuarioApi,
        LlaveApi: credenciales.llaveApi,
        identificador
      },
      body: xml,
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
  if (datos.resultado !== true) throw fallo(422, mensajeDeErrores(datos, accion));
  return datos;
};

const fechaDe = (texto) => {
  const fecha = texto ? new Date(texto) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha : new Date();
};

const certificar = async ({ xml, credenciales, referencia }) => {
  const datos = await transaccion({ xml, credenciales, identificador: referencia, accion: 'certificó' });
  if (!datos.uuid) throw fallo(502, 'INFILE certificó sin devolver el número de autorización; revisa la factura en el portal de INFILE');
  return {
    uuid: String(datos.uuid).toUpperCase(),
    serie: datos.serie,
    numero: String(datos.numero),
    fechaCertificacion: fechaDe(datos.fecha),
    xmlCertificado: datos.xml_certificado ? desdeBase64(datos.xml_certificado) : xml
  };
};

const anular = async ({ xml, credenciales, referencia }) => {
  // El identificador debe ser distinto al de la factura: INFILE lo usa para no repetir envíos.
  const datos = await transaccion({ xml, credenciales, identificador: `${referencia}-ANU`, accion: 'anuló' });
  return {
    fechaCertificacion: fechaDe(datos.fecha),
    xmlCertificado: datos.xml_certificado ? desdeBase64(datos.xml_certificado) : xml
  };
};

module.exports = { certificar, anular, URL_TRANSACCION };
