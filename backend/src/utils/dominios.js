// Direcciones por empresa: <subdominio>.BASE_DOMAIN (por ejemplo tropinside.botengine-erp.com).
//   BASE_DOMAIN            inicio de sesión general y registro
//   soporte.BASE_DOMAIN    panel de soporte y portal de automatizaciones
//   <empresa>.BASE_DOMAIN  el ERP de esa empresa
// Sin BASE_DOMAIN, o en otra dirección (la de sslip, localhost), todo funciona como antes:
// una sola dirección para todos.

const RESERVADOS = new Set([
  'www', 'soporte', 'api', 'med', 'admin', 'app', 'mail', 'correo', 'pruebas', 'status',
  'static', 'cdn', 'ftp', 'smtp', 'erp', 'ns1', 'ns2', 'ns3'
]);
const SUBDOMINIO_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

const baseDomain = () => String(process.env.BASE_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');

const normalizarSubdominio = (valor) => String(valor || '').trim().toLowerCase();

/** Mensaje de error, o null si el subdominio sirve. */
const validarSubdominio = (valor) => {
  const sub = normalizarSubdominio(valor);
  if (!sub) return 'Escribe la dirección de la empresa';
  if (sub.length > 42) return 'La dirección puede tener hasta 42 caracteres';
  if (!SUBDOMINIO_RE.test(sub)) return 'Usa solo letras sin acentos, números y guiones (sin guion al inicio ni al final)';
  if (RESERVADOS.has(sub)) return `«${sub}» está reservada; elige otra`;
  return null;
};

/** Sugerencia a partir del nombre: «Café La Ceiba» → cafelaceiba. */
const sugerirSubdominio = (nombre) => {
  const sub = String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
  return sub && !RESERVADOS.has(sub) ? sub : `empresa${sub}`.slice(0, 30);
};

/**
 * Primer subdominio libre a partir de una sugerencia: cafelaceiba, cafelaceiba2, cafelaceiba3…
 * db: pool o cliente con acceso a organizations.
 */
const subdominioLibre = async (db, sugerido) => {
  const base = sugerido.slice(0, 38);
  const candidatos = [base, ...Array.from({ length: 49 }, (_, i) => `${base}${i + 2}`)];
  const { rows } = await db.query('SELECT subdominio FROM organizations WHERE subdominio = ANY($1)', [candidatos]);
  const usados = new Set(rows.map((r) => r.subdominio));
  return candidatos.find((c) => !usados.has(c)) || `${base}${Date.now().toString(36)}`;
};

/**
 * Qué es esta dirección: { tipo: 'raiz' | 'soporte' | 'empresa' | 'otro', subdominio }.
 * 'otro' = sin BASE_DOMAIN o una dirección fuera de él: se comporta como antes.
 */
const tipoDeHost = (hostname) => {
  const base = baseDomain();
  const host = String(hostname || '').toLowerCase();
  if (!base || !host) return { tipo: 'otro', subdominio: null };
  if (host === base || host === `www.${base}`) return { tipo: 'raiz', subdominio: null };
  if (!host.endsWith(`.${base}`)) return { tipo: 'otro', subdominio: null };
  const sub = host.slice(0, -(base.length + 1));
  if (sub === 'soporte') return { tipo: 'soporte', subdominio: null };
  // Solo un nivel (tropinside.base); hsc.med.base es otra aplicación.
  if (sub.includes('.') || !SUBDOMINIO_RE.test(sub)) return { tipo: 'otro', subdominio: null };
  return { tipo: 'empresa', subdominio: sub };
};

const hostEmpresa = (subdominio) => (baseDomain() && subdominio ? `${subdominio}.${baseDomain()}` : null);
const hostSoporte = () => (baseDomain() ? `soporte.${baseDomain()}` : null);
const urlRaiz = () => (baseDomain() ? `https://${baseDomain()}` : null);
const urlEmpresa = (subdominio) => (hostEmpresa(subdominio) ? `https://${hostEmpresa(subdominio)}` : null);
const urlSoporte = () => (hostSoporte() ? `https://${hostSoporte()}` : null);

/** Orígenes de BASE_DOMAIN que el navegador puede usar contra la API (CORS). */
const origenPermitido = (origin) => {
  const base = baseDomain();
  if (!base || !origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (url.hostname === base || url.hostname.endsWith(`.${base}`)) && !url.port;
  } catch (error) {
    return false;
  }
};

module.exports = {
  RESERVADOS,
  baseDomain,
  normalizarSubdominio,
  validarSubdominio,
  sugerirSubdominio,
  subdominioLibre,
  tipoDeHost,
  hostEmpresa,
  hostSoporte,
  urlRaiz,
  urlEmpresa,
  urlSoporte,
  origenPermitido
};
