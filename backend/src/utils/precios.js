// Precio de venta sugerido a partir del precio de compra y el margen de beneficio.
// El margen es sobre el costo: costo Q100 con 30 % → Q130.

const REDONDEOS = [0.01, 0.25, 0.5, 1, 5];

// Redondea hacia arriba al múltiplo indicado, trabajando en centavos para no arrastrar decimales.
const redondearArriba = (valor, redondeo) => {
  const paso = Math.round(redondeo * 100);
  return Math.ceil(Math.round(valor * 10000) / 100 / paso - 1e-9) * paso / 100;
};

/** Devuelve el precio sugerido o null si no hay costo. */
const precioSugerido = (costo, margen, redondeo = 0.01) => {
  const base = Number(costo);
  if (!Number.isFinite(base) || base <= 0) return null;
  return redondearArriba(base * (1 + Number(margen) / 100), redondeo);
};

module.exports = { REDONDEOS, precioSugerido, redondearArriba };
