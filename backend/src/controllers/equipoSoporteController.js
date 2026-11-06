const bcrypt = require('bcryptjs');
const platformPool = require('../db/platformConnection');
const { passwordTemporal } = require('../utils/onboarding');

// Equipo de soporte: las cuentas que entran al panel de soporte (tabla platform_admins).
// Antes solo se creaban desde el servidor con create-platform-admin.js.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// bcrypt solo usa los primeros 72 bytes; el mínimo es el mismo que pide create-platform-admin.js.
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 72;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario de soporte con ese correo' });
  if (!error.expose) console.error(fallback, error);
  res.status(error.status || 500).json({ error: error.expose ? error.message : fallback });
};

// Contraseña escrita por quien crea la cuenta, o una generada si el campo vino vacío.
const passwordElegida = (valor) => {
  const password = String(valor || '');
  if (!password) return passwordTemporal();
  if (password.length < PASSWORD_MIN) throw httpError(400, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`);
  if (Buffer.byteLength(password) > PASSWORD_MAX) throw httpError(400, 'La contraseña es demasiado larga');
  return password;
};

const listar = async (req, res) => {
  try {
    const { rows } = await platformPool.query(
      `SELECT id, email, nombre, activo, ultimo_login, created_at
       FROM platform_admins
       ORDER BY activo DESC, nombre`
    );
    res.json({ equipo: rows, yo: req.platformAdmin.id });
  } catch (error) {
    sendError(res, error, 'Error cargando el equipo de soporte');
  }
};

const crear = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 150);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!nombre) throw httpError(400, 'Escribe el nombre');
    if (!EMAIL_RE.test(email) || email.length > 150) throw httpError(400, 'El correo no es válido');
    const password = passwordElegida(req.body.password);

    await platformPool.query(
      `INSERT INTO platform_admins (email, password_hash, nombre)
       VALUES ($1, $2, $3)`,
      [email, await bcrypt.hash(password, 12), nombre]
    );
    res.status(201).json({
      success: true,
      message: `Usuario de soporte creado: ${email}`,
      credenciales: { email, password }
    });
  } catch (error) {
    sendError(res, error, 'Error creando el usuario de soporte');
  }
};

const cambiarPassword = async (req, res) => {
  try {
    const password = passwordElegida(req.body.password);
    const { rows } = await platformPool.query(
      `UPDATE platform_admins SET password_hash = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING email`,
      [await bcrypt.hash(password, 12), req.params.id]
    );
    if (!rows[0]) throw httpError(404, 'Usuario de soporte no encontrado');
    res.json({
      success: true,
      message: `Contraseña cambiada para ${rows[0].email}`,
      credenciales: { email: rows[0].email, password }
    });
  } catch (error) {
    sendError(res, error, 'Error cambiando la contraseña');
  }
};

const cambiarEstado = async (req, res) => {
  try {
    const activo = req.body.activo === true;
    // Desactivarse a uno mismo cerraría la sesión sin forma de volver a entrar.
    if (!activo && Number(req.params.id) === req.platformAdmin.id) {
      throw httpError(400, 'No puedes desactivar tu propia cuenta; pide a otra persona de soporte que lo haga');
    }
    const { rows } = await platformPool.query(
      `UPDATE platform_admins SET activo = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING email`,
      [activo, req.params.id]
    );
    if (!rows[0]) throw httpError(404, 'Usuario de soporte no encontrado');
    res.json({ success: true, message: `${rows[0].email} ${activo ? 'activado' : 'desactivado'}` });
  } catch (error) {
    sendError(res, error, 'Error cambiando el estado del usuario de soporte');
  }
};

module.exports = { listar, crear, cambiarPassword, cambiarEstado };
