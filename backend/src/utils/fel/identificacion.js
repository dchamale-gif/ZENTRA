// Validación del receptor de una factura: NIT (con dígito verificador), CUI del DPI o CF.

const normalizarId = (value) => String(value ?? '').toUpperCase().replace(/[\s-]/g, '');

// NIT guatemalteco: el último carácter es el verificador (módulo 11; 10 se escribe K).
const nitValido = (value) => {
  const nit = normalizarId(value);
  if (!/^[1-9]\d*[\dK]$/.test(nit) || nit.length > 13) return false;
  const cuerpo = nit.slice(0, -1);
  const suma = [...cuerpo].reduce((total, digit, index) => total + Number(digit) * (cuerpo.length + 1 - index), 0);
  const resto = (11 - (suma % 11)) % 11;
  return nit.slice(-1) === (resto === 10 ? 'K' : String(resto));
};

// CUI del DPI: 13 dígitos; los dígitos 10-11 son el departamento (01-22).
const cuiValido = (value) => {
  const cui = normalizarId(value);
  if (!/^\d{13}$/.test(cui)) return false;
  const departamento = Number(cui.slice(9, 11));
  return departamento >= 1 && departamento <= 22;
};

/**
 * Devuelve { id, tipo, nombre } listo para el XML, o lanza un error con qué corregir.
 * tipo: null (NIT o CF) · 'CUI'.
 */
const normalizarReceptor = ({ id, nombre, tipo } = {}) => {
  const valor = normalizarId(id);
  const nombreLimpio = String(nombre ?? '').trim().replace(/\s+/g, ' ').slice(0, 400);
  const error = (message) => Object.assign(new Error(message), { status: 400, expose: true });

  if (!valor || ['CF', 'C/F', 'C.F.'].includes(valor)) {
    return { id: 'CF', tipo: null, nombre: nombreLimpio || 'Consumidor Final' };
  }
  if (tipo === 'CUI' || (/^\d{13}$/.test(valor) && !nitValido(valor))) {
    if (!cuiValido(valor)) throw error('El CUI (DPI) debe tener 13 dígitos válidos');
    if (!nombreLimpio) throw error('Escribe el nombre del cliente que aparece en su DPI');
    return { id: valor, tipo: 'CUI', nombre: nombreLimpio };
  }
  if (!nitValido(valor)) throw error(`El NIT ${id} no es válido: revisa el último dígito o usa CF`);
  if (!nombreLimpio) throw error('Escribe el nombre del cliente tal como aparece en su NIT');
  return { id: valor, tipo: null, nombre: nombreLimpio };
};

module.exports = { nitValido, cuiValido, normalizarId, normalizarReceptor };
