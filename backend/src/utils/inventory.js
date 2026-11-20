// Reglas de inventario compartidas por artículos, notificaciones y panel.

// Un artículo con esta cantidad o menos se considera con existencia baja.
const LOW_STOCK_THRESHOLD = 5;

// Límites de las columnas NUMERIC(10,2) e INTEGER de codigos_articulos.
const MAX_PRICE = 99999999.99;
const MAX_QUANTITY = 2147483647;

const NUMERIC_FIELDS = [
  ['precio_unitario', 'El precio de venta', MAX_PRICE, false],
  ['precio_costo', 'El precio de compra', MAX_PRICE, false],
  ['cantidad_disponible', 'La existencia', MAX_QUANTITY, true]
];

// Cantidades: enteras, o con hasta 3 decimales si el artículo se vende por fracción
// (codigos_articulos.vende_fraccion: por libra, metro…).
const cantidadPermitida = (cantidad, fraccion = false) => (fraccion
  ? Number.isFinite(cantidad) && Math.abs(Math.round(cantidad * 1000) - cantidad * 1000) < 1e-6
  : Number.isInteger(cantidad));

const mensajeCantidad = (nombre, fraccion) => (fraccion
  ? `La cantidad de «${nombre}» admite hasta 3 decimales (por ejemplo 1.5).`
  : `«${nombre}» se vende por unidades enteras. Si se vende por libra u otra medida, márcalo en Artículos como «Se vende por fracción».`);

/**
 * Devuelve un mensaje de error si algún precio o existencia no es válido,
 * o null si todo está bien. Los campos ausentes se ignoran (actualización parcial).
 * fraccion: el artículo se vende por fracción (la existencia puede tener decimales).
 */
const validateArticleNumbers = (body, { fraccion = false } = {}) => {
  for (const [field, label, max, integer] of NUMERIC_FIELDS) {
    const raw = body[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) return `${label} debe ser un número.`;
    if (value < 0) return `${label} no puede ser negativo.`;
    if (integer && !cantidadPermitida(value, fraccion)) {
      return fraccion ? `${label} admite hasta 3 decimales.` : `${label} debe ser un número entero.`;
    }
    if (value > max) {
      return `${label} es demasiado grande (máximo ${max.toLocaleString('es-GT')}).`;
    }
  }
  return null;
};

// Errores de PostgreSQL causados por datos del usuario: se responden con 400 y un
// mensaje que dice qué corregir, en lugar de un 500 genérico.
const DB_INPUT_ERRORS = {
  '22001': 'Uno de los textos es demasiado largo. Acórtalo e inténtalo de nuevo.',
  '22003': 'Uno de los montos o cantidades es demasiado grande.',
  '22P02': 'Uno de los valores no tiene el formato correcto.'
};

const dbInputErrorMessage = (error) => DB_INPUT_ERRORS[error?.code] || null;

// La unidad de medida es una palabra (unidad, libra); un número ahí se confunde con la existencia.
const unidadInvalida = (unidad) => {
  const texto = String(unidad ?? '').trim();
  return texto !== '' && !/[a-záéíóúñ]/i.test(texto)
    ? 'La unidad de medida es una palabra (unidad, caja, libra). La cantidad va en Existencia.'
    : null;
};

module.exports = { LOW_STOCK_THRESHOLD, validateArticleNumbers, dbInputErrorMessage, cantidadPermitida, mensajeCantidad, unidadInvalida };
