// Hasta dónde pueden consultar ventas y compras los usuarios que no son administradores:
// hoy y los 6 días anteriores (una semana). El administrador ve todo el historial.
const DIAS_PERMITIDOS = 7;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const hoyGuatemala = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());

const restarDias = (ymd, dias) => {
  const [anio, mes, dia] = ymd.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia - dias));
  return fecha.toISOString().slice(0, 10);
};

const esAdmin = (req) => (req.userRoles || []).includes('admin');

/**
 * Ajusta { desde, hasta } (AAAA-MM-DD) a lo que el usuario puede ver.
 * Administrador: sin cambios y limite = null. Los demás: nada antes de hace 6 días ni después
 * de hoy; sin fechas, la semana completa. Devuelve también el límite para mostrarlo.
 */
const limitarRango = (req, { desde, hasta } = {}) => {
  const valida = (valor) => (FECHA_RE.test(String(valor || '')) && !Number.isNaN(Date.parse(valor)) ? String(valor) : '');
  if (esAdmin(req)) return { desde: valida(desde), hasta: valida(hasta), limite: null };
  const hoy = hoyGuatemala();
  const minimo = restarDias(hoy, DIAS_PERMITIDOS - 1);
  let inicio = valida(desde) || minimo;
  let fin = valida(hasta) || hoy;
  if (inicio < minimo) inicio = minimo;
  if (fin > hoy) fin = hoy;
  if (fin < minimo) fin = minimo;
  if (inicio > fin) inicio = fin;
  return { desde: inicio, hasta: fin, limite: { desde: minimo, hasta: hoy, dias: DIAS_PERMITIDOS } };
};

module.exports = { limitarRango, hoyGuatemala, restarDias, DIAS_PERMITIDOS };
