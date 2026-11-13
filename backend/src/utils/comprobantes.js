// Comprobantes de pago que suben los clientes: foto o PDF de la transferencia.
// El tipo se decide por los primeros bytes del archivo, no por lo que diga el navegador.
const MAX_BYTES = 5 * 1024 * 1024;

const TIPOS = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'],
  ['application/pdf', (b) => b.toString('ascii', 0, 5) === '%PDF-']
];

const error = (message) => Object.assign(new Error(message), { status: 400, expose: true });

/** Acepta base64 con o sin prefijo «data:...;base64,». Devuelve { mime, buffer } o lanza 400. */
const leerComprobante = (valor) => {
  const texto = String(valor || '').trim();
  if (!texto) throw error('Adjunta la foto o el PDF del comprobante');
  const base64 = texto.replace(/^data:[^,]*;base64,/i, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) throw error('El archivo del comprobante no se pudo leer; vuelve a adjuntarlo');
  if (base64.length * 0.75 > MAX_BYTES + 3) throw error('El comprobante pesa más de 5 MB; toma la foto con menos resolución');
  const buffer = Buffer.from(base64, 'base64');
  const tipo = buffer.length > 12 ? TIPOS.find(([, prueba]) => prueba(buffer)) : null;
  if (!tipo) throw error('El comprobante debe ser una foto (JPG, PNG o WEBP) o un PDF');
  return { mime: tipo[0], buffer };
};

module.exports = { leerComprobante, MAX_BYTES };
