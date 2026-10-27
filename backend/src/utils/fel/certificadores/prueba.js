const crypto = require('crypto');
const { fechaGuatemala } = require('../dte');

// Certificador simulado: devuelve un número de autorización con el mismo formato que la
// SAT para probar el flujo completo sin certificador real. Los documentos no tienen validez
// fiscal y el XML lo dice en NombreCertificador.

const NOMBRE = 'MODO DE PRUEBA - SIN VALIDEZ FISCAL';
const NIT_PRUEBA = '11111111';

// Serie: primeros 8 caracteres del UUID; número: los siguientes 8 en decimal.
const autorizacion = () => {
  const uuid = crypto.randomUUID().toUpperCase();
  const hex = uuid.replace(/-/g, '');
  return { uuid, serie: hex.slice(0, 8), numero: String(parseInt(hex.slice(8, 16), 16)) };
};

const certificacionXml = (fecha, { uuid, serie, numero } = {}) => `
      <dte:Certificacion>
        <dte:NITCertificador>${NIT_PRUEBA}</dte:NITCertificador>
        <dte:NombreCertificador>${NOMBRE}</dte:NombreCertificador>${uuid ? `
        <dte:NumeroAutorizacion Serie="${serie}" Numero="${numero}">${uuid}</dte:NumeroAutorizacion>` : ''}
        <dte:FechaHoraCertificacion>${fecha}</dte:FechaHoraCertificacion>
      </dte:Certificacion>
`;

const certificar = async ({ xml }) => {
  const datos = autorizacion();
  const fecha = fechaGuatemala();
  return {
    ...datos,
    fechaCertificacion: new Date(),
    xmlCertificado: xml.replace('</dte:DatosEmision>', `</dte:DatosEmision>${certificacionXml(fecha, datos)}`)
  };
};

const anular = async ({ xml }) => {
  const fecha = fechaGuatemala();
  return {
    fechaCertificacion: new Date(),
    xmlCertificado: xml.replace(/(<dte:DatosGenerales[^>]*\/>)/, `$1${certificacionXml(fecha)}`)
  };
};

module.exports = { certificar, anular };
