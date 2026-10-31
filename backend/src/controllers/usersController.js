const bcrypt = require('bcryptjs');
const pool = require('../db/authConnection');
const { MODULES, MODULE_KEYS, NIVELES, enabledModules } = require('../utils/modules');

const ROLES = new Set(['admin', 'usuario']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const httpError = (status, message) => Object.assign(new Error(message), { status });

const sendError = (res, error, fallback) => {
  if (error.message === 'USER_LIMIT_REACHED') {
    return res.status(409).json({
      error: 'Ya usas todos los usuarios de tu licencia. Desactiva uno o pide a soporte ampliar el límite.',
      code: 'USER_LIMIT_REACHED'
    });
  }
  if (error.code === '23505') {
    return res.status(409).json({ error: 'Ese correo ya está registrado' });
  }
  if (!error.status) console.error(fallback, error);
  res.status(error.status || 500).json({ error: error.status ? error.message : fallback });
};

const getSeats = async (db, organizationId) => {
  const result = await db.query(
    `SELECT o.license_max_users AS max,
            (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.activo)::INTEGER AS used
     FROM organizations o WHERE o.id = $1`,
    [organizationId]
  );
  const { max, used } = result.rows[0];
  return { max, used, available: Math.max(max - used, 0) };
};

// Solo se guardan módulos habilitados para la empresa y niveles válidos.
const normalizeModules = (modules, organizationModules) => {
  const enabled = enabledModules(organizationModules);
  if (!Array.isArray(modules)) return [];
  const byKey = new Map();
  for (const entry of modules) {
    if (MODULE_KEYS.has(entry?.modulo) && NIVELES.has(entry?.nivel) && enabled.includes(entry.modulo)) {
      byKey.set(entry.modulo, entry.nivel);
    }
  }
  return [...byKey].map(([modulo, nivel]) => ({ modulo, nivel }));
};

const saveRoleAndModules = async (client, userId, rol, modules) => {
  await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
  await client.query(
    'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE nombre = $2',
    [userId, rol]
  );
  await client.query('DELETE FROM user_module_access WHERE user_id = $1', [userId]);
  if (rol === 'admin') return;
  for (const { modulo, nivel } of modules) {
    await client.query(
      'INSERT INTO user_module_access (user_id, modulo, nivel) VALUES ($1, $2, $3)',
      [userId, modulo, nivel]
    );
  }
};

const countActiveAdmins = async (client, organizationId, excludeUserId) => {
  const result = await client.query(
    `SELECT COUNT(*)::INTEGER AS total FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id AND r.nombre = 'admin'
     WHERE u.organization_id = $1 AND u.activo AND u.id <> $2`,
    [organizationId, excludeUserId]
  );
  return result.rows[0].total;
};

const listUsers = async (req, res) => {
  try {
    const organizationId = req.organization.id;
    const result = await pool.query(
      `SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.activo, u.ultimo_login, u.created_at,
              CASE WHEN bool_or(r.nombre = 'admin') THEN 'admin' ELSE 'usuario' END AS rol,
              COALESCE(
                (SELECT json_agg(json_build_object('modulo', a.modulo, 'nivel', a.nivel) ORDER BY a.modulo)
                 FROM user_module_access a WHERE a.user_id = u.id),
                '[]'::json
              ) AS modulos
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.organization_id = $1
       GROUP BY u.id
       ORDER BY u.activo DESC, u.nombre`,
      [organizationId]
    );
    const enabled = enabledModules(req.organization.modules);
    res.json({
      success: true,
      users: result.rows,
      seats: await getSeats(pool, organizationId),
      modules: MODULES.filter((module) => enabled.includes(module.key))
        .map(({ key, label }) => ({ key, label })),
      currentUserId: req.user.id
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo usuarios');
  }
};

const createUser = async (req, res) => {
  let client;
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const nombre = String(req.body.nombre || '').trim();
    const apellido = String(req.body.apellido || '').trim();
    const password = String(req.body.password || '');
    const rol = ROLES.has(req.body.rol) ? req.body.rol : 'usuario';
    if (!nombre || !apellido) throw httpError(400, 'Nombre y apellido son requeridos');
    if (!EMAIL_RE.test(email)) throw httpError(400, 'El correo no es válido');
    if (password.length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres');
    const modules = normalizeModules(req.body.modulos, req.organization.modules);
    if (rol === 'usuario' && modules.length === 0) {
      throw httpError(400, 'Asigna al menos un módulo al usuario');
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);
    // El trigger de la base rechaza el alta si se supera la capacidad de la licencia.
    const result = await client.query(
      `INSERT INTO users (organization_id, email, password_hash, nombre, apellido, telefono,
                          activo, verificado, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW(), NOW())
       RETURNING id`,
      [req.organization.id, email, passwordHash, nombre, apellido, req.body.telefono?.trim() || null]
    );
    await saveRoleAndModules(client, result.rows[0].id, rol, modules);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: `Usuario ${email} creado` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error creando usuario');
  } finally {
    if (client) client.release();
  }
};

const updateUser = async (req, res) => {
  let client;
  try {
    const userId = Number(req.params.id);
    const organizationId = req.organization.id;
    const isSelf = userId === Number(req.user.id);

    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id, activo FROM users WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [userId, organizationId]
    );
    if (existing.rows.length === 0) throw httpError(404, 'Usuario no encontrado');

    const rol = ROLES.has(req.body.rol) ? req.body.rol : null;
    const activo = typeof req.body.activo === 'boolean' ? req.body.activo : existing.rows[0].activo;
    if (isSelf && (activo === false || rol === 'usuario')) {
      throw httpError(400, 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
    }
    if ((activo === false || rol === 'usuario') && await countActiveAdmins(client, organizationId, userId) === 0) {
      throw httpError(400, 'La empresa debe conservar al menos un administrador activo');
    }

    const nombre = req.body.nombre !== undefined ? String(req.body.nombre).trim() : null;
    const apellido = req.body.apellido !== undefined ? String(req.body.apellido).trim() : null;
    if (nombre === '' || apellido === '') throw httpError(400, 'Nombre y apellido no pueden quedar vacíos');

    await client.query(
      `UPDATE users SET nombre = COALESCE($1, nombre), apellido = COALESCE($2, apellido),
              activo = $3, updated_at = NOW()
       WHERE id = $4`,
      [nombre, apellido, activo, userId]
    );
    if (rol) {
      const modules = normalizeModules(req.body.modulos, req.organization.modules);
      if (rol === 'usuario' && modules.length === 0) throw httpError(400, 'Asigna al menos un módulo al usuario');
      await saveRoleAndModules(client, userId, rol, modules);
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Usuario actualizado' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error actualizando usuario');
  } finally {
    if (client) client.release();
  }
};

const resetPassword = async (req, res) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres');
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 RETURNING email`,
      [await bcrypt.hash(password, 10), req.params.id, req.organization.id]
    );
    if (result.rows.length === 0) throw httpError(404, 'Usuario no encontrado');
    res.json({ success: true, message: `Contraseña de ${result.rows[0].email} actualizada` });
  } catch (error) {
    sendError(res, error, 'Error cambiando la contraseña');
  }
};

// normalizeModules, saveRoleAndModules y countActiveAdmins también los usa el panel de soporte.
module.exports = { listUsers, createUser, updateUser, resetPassword, normalizeModules, saveRoleAndModules, countActiveAdmins };
