// Catálogo de certificadores FEL. Cada empresa elige el suyo en Configuración.
//
// Un conector exporta:
//   certificar({ xml, emisor, credenciales, ambiente, referencia })
//     → { uuid, serie, numero, fechaCertificacion, xmlCertificado }
//   anular({ xml, emisor, credenciales, ambiente, referencia })
//     → { fechaCertificacion, xmlCertificado }
// y lanza un error con expose: true y un mensaje claro si el certificador rechaza el documento
// (con status 422) o no responde (con status 502).
//
// Para agregar un certificador: escribir su conector con la documentación y el ambiente de
// pruebas que entrega al contratarlo, registrarlo en CONECTORES y marcarlo disponible.

const CATALOGO = [
  {
    id: 'prueba',
    nombre: 'Modo de prueba (sin validez fiscal)',
    disponible: true,
    campos: []
  },
  {
    id: 'infile',
    nombre: 'INFILE',
    disponible: false,
    campos: [
      { id: 'usuarioFirma', label: 'Usuario de firma (alias)' },
      { id: 'llaveFirma', label: 'Llave de firma', secreto: true },
      { id: 'usuarioApi', label: 'Usuario API' },
      { id: 'llaveApi', label: 'Llave API', secreto: true }
    ]
  },
  {
    id: 'digifact',
    nombre: 'Digifact',
    disponible: false,
    campos: [
      { id: 'usuario', label: 'Usuario' },
      { id: 'password', label: 'Contraseña', secreto: true }
    ]
  },
  {
    id: 'g4s',
    nombre: 'G4S / Guatefacturas',
    disponible: false,
    campos: [
      { id: 'usuario', label: 'Usuario' },
      { id: 'password', label: 'Contraseña', secreto: true }
    ]
  }
];

const CONECTORES = {
  prueba: require('./prueba')
};

const obtenerConector = (id) => {
  const info = CATALOGO.find((entry) => entry.id === id);
  const conector = CONECTORES[id];
  if (!info || !conector || !info.disponible) {
    throw Object.assign(
      new Error(`El certificador «${info?.nombre || id}» todavía no está conectado en el ERP; elige otro en Configuración → Facturación`),
      { status: 400, expose: true }
    );
  }
  return conector;
};

module.exports = { CATALOGO, obtenerConector };
