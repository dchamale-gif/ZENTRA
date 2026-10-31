const bcrypt = require('bcryptjs');
const authPool = require('../db/authConnection');
const platformPool = require('../db/platformConnection');
const { enviarCorreo, appUrl } = require('../utils/email');
const plantillas = require('../utils/plantillasCorreo');
const { passwordTemporal } = require('../utils/onboarding');
const { MODULES, enabledModules } = require('../utils/modules');
const { normalizeModules, saveRoleAndModules, countActiveAdmins } = require('./usersController');
const { crearSesionSoporte } = require('./authController');
const { setSessionCookie } = require('../utils/sessionCookie');
const { FACTURA_SELECT, mapFactura } = require('./facturasPlataformaController');

// Ficha de cada empresa en el panel de soporte: datos, usuarios, facturas, notas y la entrada
// a la empresa para ver lo que ve el cliente.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['admin', 'usuario']);

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (error.message === 'USER_LIMIT_REACHED') {
    return res.status(409).json({ error: 'La empresa ya usa todos los usuarios de su licencia; amplía el límite en «Licencia» o desactiva uno' });
  }
  if (error.code === '23505') return res.status(409).json({ error: 'Ese correo ya está registrado en otra cuenta' });
  if (!error.expose) console.error(fallback, error);
  res.status(error.status || 500).json({ error: error.expose ? error.message : fallback });
};

const organizacionDe = async (db, id) => {
  const { rows } = await db.query(
    `SELECT id, nombre, modulos_habilitados, subscription_status, trial_ends_at, subscription_ends_at
     FROM organizations WHERE id = $1`,
    [id]
  );
  if (!rows[0]) throw httpError(404, 'Empresa no encontrada');
  return rows[0];
};

// Módulos que se pueden asignar a los usuarios de la empresa (los habilitados por soporte).
const modulosAsignables = (modulosHabilitados) => {
  const enabled = enabledModules(modulosHabilitados);
  return MODULES.filter((module) => enabled.includes(module.key)).map(({ key, label }) => ({ key, label }));
};

const nombresDeSoporte = async () => {
  const { rows } = await platformPool.query('SELECT id, nombre FROM platform_admins');
  return new Map(rows.map((row) => [row.id, row.nombre]));
};

const ficha = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [org, usuarios, facturas, notas, contratos, accesos, nombres] = await Promise.all([
      authPool.query(
        `SELECT id, nombre, sector_comercial, email, nit, telefono, direccion, cuota_mensual,
                modulos_habilitados, subscription_status, license_plan, license_key, license_max_users,
                trial_ends_at, subscription_ends_at, created_at
         FROM organizations WHERE id = $1`,
        [id]
      ),
      authPool.query(
        `SELECT u.id, u.nombre, u.apellido, u.email, u.activo, u.ultimo_login, u.created_at,
                u.email_verificado_en IS NOT NULL AS verificado, u.debe_cambiar_password,
                CASE WHEN bool_or(r.nombre = 'admin') THEN 'admin' ELSE 'usuario' END AS rol,
                COALESCE((SELECT json_agg(json_build_object('modulo', a.modulo, 'nivel', a.nivel) ORDER BY a.modulo)
                          FROM user_module_access a WHERE a.user_id = u.id), '[]'::json) AS modulos
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE u.organization_id = $1
         GROUP BY u.id
         ORDER BY u.activo DESC, u.created_at, u.id`,
        [id]
      ),
      authPool.query(`${FACTURA_SELECT} WHERE f.organization_id = $1 ORDER BY f.fecha_emision DESC, f.id DESC LIMIT 50`, [id]),
      authPool.query(
        'SELECT id, texto, autor_id, created_at FROM organizacion_notas WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 100',
        [id]
      ),
      authPool.query(
        `SELECT numero, created_at, enviado_en, (datos->>'mensualidad')::NUMERIC AS mensualidad
         FROM contratos WHERE organization_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
      authPool.query(
        `SELECT a.platform_admin_id, a.modo, a.created_at, u.email
         FROM soporte_accesos a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.organization_id = $1 ORDER BY a.created_at DESC LIMIT 10`,
        [id]
      ),
      nombresDeSoporte()
    ]);
    const o = org.rows[0];
    if (!o) throw httpError(404, 'Empresa no encontrada');
    res.json({
      success: true,
      empresa: {
        id: o.id,
        nombre: o.nombre,
        sector: o.sector_comercial,
        email: o.email,
        nit: o.nit,
        telefono: o.telefono,
        direccion: o.direccion,
        cuotaMensual: o.cuota_mensual === null ? null : Number(o.cuota_mensual),
        estado: o.subscription_status,
        plan: o.license_plan,
        licencia: o.license_key,
        maxUsuarios: o.license_max_users,
        pruebaHasta: o.trial_ends_at,
        suscripcionHasta: o.subscription_ends_at,
        creada: o.created_at,
        modulosAsignables: modulosAsignables(o.modulos_habilitados)
      },
      usuarios: usuarios.rows.map((u) => ({
        id: u.id,
        nombre: [u.nombre, u.apellido].filter(Boolean).join(' '),
        email: u.email,
        activo: u.activo,
        rol: u.rol,
        modulos: u.modulos,
        verificado: u.verificado,
        pendienteCambio: u.debe_cambiar_password,
        ultimoLogin: u.ultimo_login,
        creado: u.created_at
      })),
      facturas: facturas.rows.map(mapFactura),
      notas: notas.rows.map((n) => ({ id: n.id, texto: n.texto, autor: nombres.get(n.autor_id) || 'Soporte', fecha: n.created_at })),
      contratos: contratos.rows.map((c) => ({ numero: c.numero, fecha: c.created_at, enviado: c.enviado_en, mensualidad: c.mensualidad && Number(c.mensualidad) })),
      accesos: accesos.rows.map((a) => ({ autor: nombres.get(a.platform_admin_id) || 'Soporte', modo: a.modo, comoUsuario: a.email, fecha: a.created_at }))
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo la ficha de la empresa');
  }
};

const textoOpcional = (value, max) => {
  const texto = String(value ?? '').trim().slice(0, max);
  return texto || null;
};

// Datos de contacto y cuota mensual de la empresa.
const actualizarDatos = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim().slice(0, 150);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!nombre) throw httpError(400, 'El nombre de la empresa es requerido');
    if (email && !EMAIL_RE.test(email)) throw httpError(400, 'El correo de facturación no es válido');
    let cuota = null;
    if (req.body.cuotaMensual !== null && req.body.cuotaMensual !== undefined && req.body.cuotaMensual !== '') {
      cuota = Math.round(Number(req.body.cuotaMensual) * 100) / 100;
      if (!Number.isFinite(cuota) || cuota < 0 || cuota > 1000000) throw httpError(400, 'La cuota mensual no es válida');
    }
    const { rowCount } = await authPool.query(
      `UPDATE organizations
       SET nombre = $1, sector_comercial = $2, email = $3, nit = $4, telefono = $5, direccion = $6,
           cuota_mensual = $7, updated_at = NOW()
       WHERE id = $8`,
      [nombre, textoOpcional(req.body.sector, 150), email || null, textoOpcional(req.body.nit, 30),
        textoOpcional(req.body.telefono, 30), textoOpcional(req.body.direccion, 255), cuota, req.params.id]
    );
    if (!rowCount) throw httpError(404, 'Empresa no encontrada');
    res.json({ success: true, message: 'Datos de la empresa guardados' });
  } catch (error) {
    sendError(res, error, 'Error guardando los datos de la empresa');
  }
};

// Envía la contraseña temporal por correo. Devuelve null si salió o el motivo si no.
const enviarCredenciales = async ({ email, nombre, empresa, password, motivo }) => {
  try {
    const correo = plantillas.credenciales({ nombre, empresa, url: appUrl(), email, password, diasPrueba: null, motivo });
    await enviarCorreo({ para: email, nombre, asunto: correo.asunto, html: correo.html, texto: correo.texto });
    return null;
  } catch (error) {
    if (!error.expose) console.error('Error enviando credenciales:', error);
    return error.expose ? error.message : 'No se pudo enviar el correo';
  }
};

// Alta de un usuario de la empresa con contraseña temporal (se cambia en el primer ingreso).
const crearUsuario = async (req, res) => {
  let client;
  try {
    const organizationId = Number(req.params.id);
    const email = String(req.body.email || '').trim().toLowerCase();
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const apellido = String(req.body.apellido || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const rol = ROLES.has(req.body.rol) ? req.body.rol : 'usuario';
    if (!nombre) throw httpError(400, 'El nombre es requerido');
    if (!EMAIL_RE.test(email)) throw httpError(400, 'El correo no es válido');

    client = await authPool.connect();
    await client.query('BEGIN');
    const org = await organizacionDe(client, organizationId);
    const modules = normalizeModules(req.body.modulos, org.modulos_habilitados);
    if (rol === 'usuario' && modules.length === 0) throw httpError(400, 'Asigna al menos un módulo al usuario');
    const password = passwordTemporal();
    // El trigger de la base rechaza el alta si se supera la capacidad de la licencia.
    const result = await client.query(
      `INSERT INTO users (organization_id, email, password_hash, nombre, apellido, activo, verificado,
                          email_verificado_en, debe_cambiar_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, true, NOW(), true, NOW(), NOW())
       RETURNING id`,
      [organizationId, email, await bcrypt.hash(password, 10), nombre, apellido || null]
    );
    await saveRoleAndModules(client, result.rows[0].id, rol, modules);
    await client.query('COMMIT');
    client.release();
    client = null;

    const errorCorreo = req.body.enviarCorreo === false
      ? 'no se pidió enviar el correo'
      : await enviarCredenciales({ email, nombre, empresa: org.nombre, password, motivo: 'nuevo' });
    res.status(201).json({
      success: true,
      message: errorCorreo
        ? `Usuario ${email} creado. El correo no salió (${errorCorreo}); comparte la contraseña temporal por otro medio.`
        : `Usuario ${email} creado; le enviamos su contraseña temporal.`,
      correoEnviado: !errorCorreo,
      credenciales: { email, password }
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    sendError(res, error, 'Error creando el usuario');
  }
};

// Activar/desactivar o cambiar el rol y los módulos de un usuario de la empresa.
const actualizarUsuario = async (req, res) => {
  let client;
  try {
    const organizationId = Number(req.params.id);
    const userId = Number(req.params.userId);
    client = await authPool.connect();
    await client.query('BEGIN');
    const org = await organizacionDe(client, organizationId);
    const existing = await client.query(
      'SELECT activo, email FROM users WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [userId, organizationId]
    );
    if (!existing.rows[0]) throw httpError(404, 'Usuario no encontrado');
    if (existing.rows[0].email.startsWith('baja-')) throw httpError(409, 'La empresa está dada de baja; sus usuarios no se pueden reactivar');
    const activo = typeof req.body.activo === 'boolean' ? req.body.activo : existing.rows[0].activo;
    const rol = ROLES.has(req.body.rol) ? req.body.rol : null;
    if ((activo === false || rol === 'usuario') && await countActiveAdmins(client, organizationId, userId) === 0) {
      throw httpError(400, 'La empresa debe conservar al menos un administrador activo');
    }
    // Reactivar cuenta un lugar de la licencia: lo valida el trigger de la base.
    await client.query('UPDATE users SET activo = $1, updated_at = NOW() WHERE id = $2', [activo, userId]);
    if (rol) {
      const modules = normalizeModules(req.body.modulos, org.modulos_habilitados);
      if (rol === 'usuario' && modules.length === 0) throw httpError(400, 'Asigna al menos un módulo al usuario');
      await saveRoleAndModules(client, userId, rol, modules);
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Usuario ${existing.rows[0].email} actualizado` });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    sendError(res, error, 'Error actualizando el usuario');
  } finally {
    if (client) client.release();
  }
};

// Nueva contraseña temporal para un usuario: se envía por correo y se muestra una vez en el panel.
const restablecerPassword = async (req, res) => {
  try {
    const password = passwordTemporal();
    const { rows } = await authPool.query(
      `UPDATE users u SET password_hash = $1, debe_cambiar_password = true, updated_at = NOW()
       FROM organizations o
       WHERE u.id = $2 AND u.organization_id = $3 AND o.id = u.organization_id AND u.email NOT LIKE 'baja-%'
       RETURNING u.email, u.nombre, o.nombre AS empresa`,
      [await bcrypt.hash(password, 10), req.params.userId, req.params.id]
    );
    const usuario = rows[0];
    if (!usuario) throw httpError(404, 'Usuario no encontrado');
    const errorCorreo = await enviarCredenciales({ email: usuario.email, nombre: usuario.nombre, empresa: usuario.empresa, password, motivo: 'restablecida' });
    res.json({
      success: true,
      message: errorCorreo
        ? `Contraseña restablecida. El correo no salió (${errorCorreo}); comparte la temporal por otro medio.`
        : `Contraseña restablecida y enviada a ${usuario.email}.`,
      correoEnviado: !errorCorreo,
      credenciales: { email: usuario.email, password }
    });
  } catch (error) {
    sendError(res, error, 'Error restableciendo la contraseña');
  }
};

const crearNota = async (req, res) => {
  try {
    const texto = String(req.body.texto || '').trim().slice(0, 4000);
    if (!texto) throw httpError(400, 'Escribe la nota');
    await organizacionDe(authPool, req.params.id);
    await authPool.query(
      'INSERT INTO organizacion_notas (organization_id, texto, autor_id) VALUES ($1, $2, $3)',
      [req.params.id, texto, req.platformAdmin.id]
    );
    res.status(201).json({ success: true, message: 'Nota guardada' });
  } catch (error) {
    sendError(res, error, 'Error guardando la nota');
  }
};

const borrarNota = async (req, res) => {
  try {
    const { rowCount } = await authPool.query(
      'DELETE FROM organizacion_notas WHERE id = $1 AND organization_id = $2',
      [req.params.notaId, req.params.id]
    );
    if (!rowCount) throw httpError(404, 'Nota no encontrada');
    res.json({ success: true, message: 'Nota borrada' });
  } catch (error) {
    sendError(res, error, 'Error borrando la nota');
  }
};

/**
 * Abre una sesión dentro de la empresa como uno de sus usuarios (por defecto, el primer
 * administrador activo). modo 'ver' (solo lectura) o 'editar'. Reemplaza la sesión de soporte
 * hasta que se use «Volver al panel» (POST /api/auth/salir-soporte).
 */
const entrar = async (req, res) => {
  try {
    const organizationId = Number(req.params.id);
    const modo = req.body.modo === 'editar' ? 'editar' : 'ver';
    const params = [organizationId];
    let filtro = `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                          WHERE ur.user_id = u.id AND r.nombre = 'admin')
                  ORDER BY u.activo DESC, u.created_at, u.id`;
    if (req.body.userId) {
      params.push(Number(req.body.userId));
      filtro = 'u.id = $2';
    }
    const { rows } = await authPool.query(
      `SELECT u.id FROM users u WHERE u.organization_id = $1 AND ${filtro} LIMIT 1`,
      params
    );
    if (!rows[0]) throw httpError(404, req.body.userId ? 'Usuario no encontrado en esta empresa' : 'La empresa no tiene un administrador');

    const sesion = await crearSesionSoporte({ userId: rows[0].id, platformAdmin: req.platformAdmin, modo });
    await authPool.query(
      'INSERT INTO soporte_accesos (platform_admin_id, organization_id, user_id, modo) VALUES ($1, $2, $3, $4)',
      [req.platformAdmin.id, organizationId, rows[0].id, modo]
    );
    const sessionExpiresAt = setSessionCookie(res, sesion.token, sesion.expiresMs);
    res.json({ success: true, user: sesion.user, sessionExpiresAt });
  } catch (error) {
    sendError(res, error, 'Error entrando a la empresa');
  }
};

module.exports = {
  ficha,
  actualizarDatos,
  crearUsuario,
  actualizarUsuario,
  restablecerPassword,
  crearNota,
  borrarNota,
  entrar
};
