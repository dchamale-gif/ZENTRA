const jwt = require('jsonwebtoken');
const pool = require('../db/platformConnection');
const { getSessionToken } = require('../utils/sessionCookie');

const buscarAdmin = async (id) => {
  const result = await pool.query(
    `SELECT id, email, nombre, activo
     FROM platform_admins
     WHERE id = $1`,
    [id]
  );
  return result.rows[0];
};

const platformAuthMiddleware = async (req, res, next) => {
  try {
    const token = getSessionToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token de soporte no proporcionado' });
    }

    // El panel de soporte no se abre desde el subdominio de una empresa.
    if (req.sitio?.tipo === 'empresa') {
      return res.status(403).json({ error: 'El panel de soporte está en otra dirección' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.platformAdmin || !decoded.platformAdminId) {
      return res.status(403).json({ error: 'Se requiere una cuenta de soporte' });
    }

    const platformAdmin = await buscarAdmin(decoded.platformAdminId);

    if (!platformAdmin || !platformAdmin.activo) {
      return res.status(401).json({ error: 'Cuenta de soporte inactiva' });
    }

    req.platformAdmin = platformAdmin;
    next();
  } catch (error) {
    console.error('Error en platformAuthMiddleware:', error.message);
    res.status(401).json({ error: 'Token de soporte inválido' });
  }
};

/**
 * GET /api/platform/sesion — Caddy lo consulta antes de cada petición al portal de
 * automatizaciones (/pruebas). Deja pasar la sesión de soporte y también la sesión dentro de
 * una empresa abierta con «Entrar como cliente»: la cookie es una sola, y si no, entrar a una
 * empresa mientras corre una prueba deja la página del resultado sin estilos (403 en el CSS).
 * Un usuario de empresa que inició sesión por su cuenta no pasa.
 */
const sesionSoporte = async (req, res) => {
  try {
    if (req.sitio?.tipo === 'empresa') return res.sendStatus(403);
    const token = getSessionToken(req);
    if (!token) return res.sendStatus(401);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const adminId = decoded.platformAdmin ? decoded.platformAdminId : decoded.soporte?.adminId;
    if (!adminId) return res.sendStatus(403);
    const platformAdmin = await buscarAdmin(adminId);
    res.sendStatus(platformAdmin?.activo ? 204 : 401);
  } catch (error) {
    res.sendStatus(401);
  }
};

module.exports = { platformAuthMiddleware, sesionSoporte };
