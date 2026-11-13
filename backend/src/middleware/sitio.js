const authPool = require('../db/authConnection');
const { tipoDeHost } = require('../utils/dominios');

// req.sitio: qué dirección pidió el navegador (ver utils/dominios.js). En un subdominio de
// empresa agrega organizationId y nombre (null si no existe esa empresa).
// Las empresas casi no cambian de subdominio: se guardan un minuto para no consultar en cada petición.
const CACHE_MS = 60 * 1000;
const cache = new Map();

const buscarEmpresa = async (subdominio) => {
  const guardada = cache.get(subdominio);
  if (guardada && guardada.vence > Date.now()) return guardada.empresa;
  const { rows } = await authPool.query(
    'SELECT id, nombre FROM organizations WHERE subdominio = $1 AND usa_erp',
    [subdominio]
  );
  const empresa = rows[0] || null;
  if (cache.size > 500) cache.clear();
  cache.set(subdominio, { empresa, vence: Date.now() + CACHE_MS });
  return empresa;
};

/** Para cuando soporte cambia un subdominio: que se note al instante. */
const olvidarSubdominio = (subdominio) => {
  if (subdominio) cache.delete(subdominio);
};

const sitioMiddleware = async (req, res, next) => {
  try {
    const sitio = tipoDeHost(req.hostname);
    if (sitio.tipo === 'empresa') {
      const empresa = await buscarEmpresa(sitio.subdominio);
      sitio.organizationId = empresa?.id ?? null;
      sitio.empresa = empresa?.nombre ?? null;
    }
    req.sitio = sitio;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { sitioMiddleware, olvidarSubdominio };
