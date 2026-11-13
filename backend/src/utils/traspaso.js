const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Pase de un solo uso para llevar una sesión a otro subdominio (la cookie de sesión es de cada
// dirección): se inicia sesión en botengine-erp.com y se entra a tropinside.botengine-erp.com.
// Lo firma el backend, vale 60 s, solo para la dirección de destino y una sola vez.
const VIGENCIA_S = 60;
const usados = new Map();

const limpiar = () => {
  const ahora = Date.now();
  for (const [jti, vence] of usados) if (vence < ahora) usados.delete(jti);
};

/**
 * { url, token }: el navegador envía token por POST (formulario) a url, que pone la cookie
 * en esa dirección. pagina: 'index' (ERP) o 'support' (panel de soporte).
 */
const crearTraspaso = ({ sessionToken, host, pagina }) => ({
  url: `https://${host}/api/auth/traspaso`,
  token: jwt.sign(
    { s: sessionToken, p: pagina === 'support' ? 'support' : 'index' },
    process.env.JWT_SECRET,
    { expiresIn: VIGENCIA_S, audience: `traspaso:${host}`, jwtid: crypto.randomBytes(12).toString('base64url') }
  )
});

/** Devuelve { sessionToken, pagina } o lanza error si venció, es de otra dirección o ya se usó. */
const usarTraspaso = (token, host) => {
  const datos = jwt.verify(String(token || ''), process.env.JWT_SECRET, { audience: `traspaso:${host}` });
  limpiar();
  if (!datos.jti || usados.has(datos.jti)) throw new Error('Pase ya usado');
  usados.set(datos.jti, datos.exp * 1000);
  // La sesión dentro del pase también la firmó este backend.
  jwt.verify(datos.s, process.env.JWT_SECRET);
  return { sessionToken: datos.s, pagina: datos.p };
};

module.exports = { crearTraspaso, usarTraspaso };
