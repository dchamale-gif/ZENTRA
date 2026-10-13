const jwt = require('jsonwebtoken');
const pool = require('../db/platformConnection');
const { getSessionToken } = require('../utils/sessionCookie');

const platformAuthMiddleware = async (req, res, next) => {
  try {
    const token = getSessionToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token de soporte no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.platformAdmin || !decoded.platformAdminId) {
      return res.status(403).json({ error: 'Se requiere una cuenta de soporte' });
    }

    const result = await pool.query(
      `SELECT id, email, nombre, activo
       FROM platform_admins
       WHERE id = $1`,
      [decoded.platformAdminId]
    );
    const platformAdmin = result.rows[0];

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

module.exports = { platformAuthMiddleware };
