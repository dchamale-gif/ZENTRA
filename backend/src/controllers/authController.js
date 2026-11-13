const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db/authConnection');
const platformPool = require('../db/platformConnection');
const { clearSessionCookie, getSessionToken, setSessionCookie } = require('../utils/sessionCookie');
const { resolveUserAccess } = require('../utils/modules');
const { verificarCorreo } = require('../utils/onboarding');
const dominios = require('../utils/dominios');
const { crearTraspaso, usarTraspaso } = require('../utils/traspaso');

const TRIAL_DAYS = 30;

/**
 * Entrega la sesión: si corresponde a otra dirección (empresa → su subdominio, soporte →
 * soporte.<dominio>), responde un pase para llevarla allá en vez de poner la cookie aquí.
 * En la dirección de siempre (sslip, localhost) pone la cookie como antes.
 */
const entregarSesion = (req, res, { token, maxAge, hostDestino, pagina, status = 200, body }) => {
  if (hostDestino && req.sitio && req.sitio.tipo !== 'otro' && req.hostname !== hostDestino) {
    return res.status(status).json({ ...body, traspaso: crearTraspaso({ sessionToken: token, host: hostDestino, pagina }) });
  }
  const sessionExpiresAt = setSessionCookie(res, token, maxAge);
  return res.status(status).json({ ...body, sessionExpiresAt });
};

const generateLicenseKey = () => {
  const value = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
};

const buildSlug = (name) => {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${normalized || 'empresa'}-${Math.random().toString(36).slice(2, 8)}`;
};

const getOrganizationPayload = (row) => {
  const trialEndsAt = new Date(row.trial_ends_at);
  return {
    id: row.organization_id,
    name: row.organization_name,
    slug: row.organization_slug,
    subdominio: row.organization_subdominio ?? null,
    url: dominios.urlEmpresa(row.organization_subdominio),
    sector: row.organization_sector,
    email: row.organization_email,
    licenseKey: row.organization_license_key,
    plan: row.organization_license_plan,
    licenseIssuedAt: row.organization_license_issued_at,
    maxUsers: row.organization_max_users,
    modules: row.organization_modules ?? null,
    felHabilitada: row.organization_fel === true,
    status: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
    subscriptionEndsAt: row.subscription_ends_at,
    trialDaysRemaining: row.subscription_status === 'trial'
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000))
      : null
  };
};

const createToken = (user, roles, permissions, { soporte, expiresIn } = {}) => jwt.sign(
  {
    userId: user.id,
    organizationId: user.organization_id,
    email: user.email,
    roles,
    permissions,
    // Sesión abierta por soporte para ver la empresa como este usuario: { adminId, nombre, modo }.
    ...(soporte ? { soporte } : {})
  },
  process.env.JWT_SECRET,
  { expiresIn: expiresIn || process.env.JWT_EXPIRATION || '7d' }
);

const SESION_SOPORTE_HORAS = 2;

const createPlatformToken = (platformAdmin) => jwt.sign(
  {
    platformAdmin: true,
    platformAdminId: platformAdmin.id,
    email: platformAdmin.email,
    roles: ['platform_admin']
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRATION || '7d' }
);

const platformSessionPayload = (platformAdmin) => ({
  token: createPlatformToken(platformAdmin),
  platformAdmin: true,
  user: {
    id: platformAdmin.id,
    email: platformAdmin.email,
    nombre: platformAdmin.nombre,
    roles: ['platform_admin'],
    platformAdmin: true
  }
});

const loginPlatformAdmin = async (email, password) => {
  const result = await platformPool.query(
    `SELECT id, email, password_hash, nombre, activo
     FROM platform_admins
     WHERE email = $1`,
    [email]
  );
  const platformAdmin = result.rows[0];
  if (!platformAdmin || !platformAdmin.activo) return null;

  const passwordMatch = await bcrypt.compare(password, platformAdmin.password_hash);
  if (!passwordMatch) return null;

  await platformPool.query(
    'UPDATE platform_admins SET ultimo_login = NOW() WHERE id = $1',
    [platformAdmin.id]
  );

  return { message: 'Acceso de soporte exitoso', ...platformSessionPayload(platformAdmin) };
};

/**
 * Sesión de soporte dentro de una empresa, como uno de sus usuarios. modo 'ver' bloquea
 * cualquier cambio (ver middleware/auth.js). Devuelve { token, user, expiresMs }.
 */
const crearSesionSoporte = async ({ userId, platformAdmin, modo }) => {
  const result = await pool.query(
    `SELECT u.id, u.organization_id, u.email, u.nombre, u.apellido,
            o.nombre AS organization_name, o.slug AS organization_slug, o.subdominio AS organization_subdominio,
            o.sector_comercial AS organization_sector,
            o.email AS organization_email,
            o.license_key AS organization_license_key,
            o.license_plan AS organization_license_plan,
            o.license_issued_at AS organization_license_issued_at,
            o.license_max_users AS organization_max_users,
            o.modulos_habilitados AS organization_modules,
            o.fel_habilitada AS organization_fel,
            o.subscription_status, o.trial_ends_at, o.subscription_ends_at
     FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [userId]
  );
  const user = result.rows[0];
  const access = await resolveUserAccess(pool, user.id, user.organization_modules);
  const soporte = { adminId: platformAdmin.id, nombre: platformAdmin.nombre, modo };
  const organization = getOrganizationPayload(user);
  return {
    token: createToken(user, access.roles, access.permissions, { soporte, expiresIn: `${SESION_SOPORTE_HORAS}h` }),
    expiresMs: SESION_SOPORTE_HORAS * 3600000,
    user: {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      roles: access.roles,
      permissions: access.permissions,
      modules: access.modules,
      isAdmin: access.isAdmin,
      soporte,
      organization
    }
  };
};

// Termina la sesión dentro de una empresa y devuelve la de soporte, sin pedir contraseña otra vez.
const salirDeSoporte = async (req, res) => {
  try {
    const token = getSessionToken(req);
    const decoded = token ? jwt.verify(token, process.env.JWT_SECRET) : null;
    if (!decoded?.soporte?.adminId) {
      return res.status(400).json({ error: 'No hay una sesión de soporte abierta' });
    }
    // En el subdominio de la empresa: se cierra la sesión de aquí; la de soporte sigue abierta
    // en soporte.<dominio> (cada dirección tiene su cookie).
    if (req.sitio?.tipo === 'empresa' && dominios.urlSoporte()) {
      clearSessionCookie(res);
      return res.json({ volverA: `${dominios.urlSoporte()}/support.html` });
    }
    const result = await platformPool.query(
      'SELECT id, email, nombre, activo FROM platform_admins WHERE id = $1',
      [decoded.soporte.adminId]
    );
    const platformAdmin = result.rows[0];
    if (!platformAdmin || !platformAdmin.activo) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Cuenta de soporte inactiva' });
    }
    const session = platformSessionPayload(platformAdmin);
    const sessionExpiresAt = setSessionCookie(res, session.token);
    delete session.token;
    res.json({ ...session, sessionExpiresAt });
  } catch (error) {
    clearSessionCookie(res);
    res.status(401).json({ error: 'La sesión de soporte venció; vuelve a iniciar sesión' });
  }
};

// REGISTRO: Crear empresa y su usuario administrador
const register = async (req, res) => {
  let client;
  try {
    const {
      email,
      password,
      nombre,
      apellido,
      telefono,
      empresaNombre,
      empresaNit,
      empresaSector,
      empresaCorreo,
      empresaTelefono,
      empresaDireccion,
      empresaSubdominio
    } = req.body;
    const subdominioElegido = dominios.normalizarSubdominio(empresaSubdominio);
    if (subdominioElegido && dominios.validarSubdominio(subdominioElegido)) {
      return res.status(400).json({ error: dominios.validarSubdominio(subdominioElegido), field: 'empresaSubdominio' });
    }
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedCompanyName = String(empresaNombre || '').trim();
    const normalizedCompanyEmail = String(empresaCorreo || normalizedEmail).trim().toLowerCase();
    const normalizedSector = String(empresaSector || '').trim();

    const missing = [
      [normalizedCompanyName, 'nombre de la empresa'],
      [nombre?.trim(), 'nombre'],
      [apellido?.trim(), 'apellido'],
      [normalizedEmail, 'correo para iniciar sesión'],
      [password, 'contraseña']
    ].filter(([value]) => !value).map(([, label]) => label);
    if (missing.length) {
      return res.status(400).json({ error: `Falta completar: ${missing.join(', ')}.` });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedCompanyEmail)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido' });
    }
    if (typeof password !== 'string' || password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ error: 'La contraseña necesita al menos 8 caracteres, con letras y números.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    let subdominio = subdominioElegido;
    if (subdominio) {
      const ocupado = await client.query('SELECT 1 FROM organizations WHERE subdominio = $1', [subdominio]);
      if (ocupado.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `La dirección ${subdominio} ya la usa otra empresa; elige otra`, field: 'empresaSubdominio' });
      }
    } else {
      subdominio = await dominios.subdominioLibre(client, dominios.sugerirSubdominio(normalizedCompanyName));
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const organizationResult = await client.query(
      `INSERT INTO organizations
       (nombre, slug, nit, sector_comercial, email, telefono, direccion,
        license_key, license_plan, license_issued_at,
        subscription_status, trial_started_at, trial_ends_at, subdominio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Trial', NOW(), 'trial', NOW(), NOW() + ($9 * INTERVAL '1 day'), $10)
       RETURNING id, nombre, slug, subdominio, sector_comercial, email, license_key, license_plan,
                 license_issued_at, license_max_users, subscription_status, trial_ends_at`,
      [
        normalizedCompanyName,
        buildSlug(normalizedCompanyName),
        empresaNit?.trim() || null,
        normalizedSector || null,
        normalizedCompanyEmail,
        empresaTelefono?.trim() || null,
        empresaDireccion?.trim() || null,
        generateLicenseKey(),
        TRIAL_DAYS,
        subdominio
      ]
    );
    const organization = organizationResult.rows[0];

    const result = await client.query(
      `INSERT INTO users
       (organization_id, email, password_hash, nombre, apellido, telefono, activo,
        verificado, ultimo_login, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW(), NOW(), NOW())
       RETURNING id, organization_id, email, nombre, apellido, telefono`,
      [
        organization.id,
        normalizedEmail,
        hashedPassword,
        nombre.trim(),
        apellido.trim(),
        telefono?.trim() || null
      ]
    );

    const user = result.rows[0];
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, (SELECT id FROM roles WHERE nombre = $2))',
      [user.id, 'admin']
    );
    await client.query('COMMIT');
    const { roles, permissions, modules } = await resolveUserAccess(pool, user.id, null);
    const organizationData = getOrganizationPayload({
      organization_id: organization.id,
      organization_name: organization.nombre,
      organization_slug: organization.slug,
      organization_subdominio: organization.subdominio,
      organization_sector: organization.sector_comercial,
      organization_email: organization.email,
      organization_license_key: organization.license_key,
      organization_license_plan: organization.license_plan,
      organization_license_issued_at: organization.license_issued_at,
      organization_max_users: organization.license_max_users,
      subscription_status: organization.subscription_status,
      trial_ends_at: organization.trial_ends_at
    });

    const token = createToken(user, roles, permissions);
    entregarSesion(req, res, {
      token,
      hostDestino: dominios.hostEmpresa(organization.subdominio),
      pagina: 'index',
      status: 201,
      body: {
      message: `Empresa registrada. Tu prueba de ${TRIAL_DAYS} días ha comenzado.`,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        roles,
        permissions,
        modules,
        isAdmin: true,
        organization: organizationData
      },
      organization: organizationData
      }
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    // Dos registros al mismo tiempo con la misma dirección.
    if (error.code === '23505' && /subdominio/.test(error.constraint || '')) {
      return res.status(409).json({ error: 'Esa dirección la acaba de tomar otra empresa; elige otra', field: 'empresaSubdominio' });
    }
    console.error('Error en register:', error);
    res.status(500).json({ error: 'Error registrando usuario' });
  } finally {
    if (client) await client.release();
  }
};

// LOGIN: Autenticar usuario
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son requeridos' });
    }

    // Buscar usuario
    const normalizedEmail = String(email).trim().toLowerCase();
    const platformSession = await loginPlatformAdmin(normalizedEmail, password);
    if (platformSession) {
      const { token: platformToken, ...body } = platformSession;
      return entregarSesion(req, res, { token: platformToken, hostDestino: dominios.hostSoporte(), pagina: 'support', body });
    }

    const result = await pool.query(
      `SELECT u.id, u.organization_id, u.email, u.password_hash, u.nombre, u.apellido, u.activo,
              u.debe_cambiar_password,
              o.nombre AS organization_name, o.slug AS organization_slug, o.subdominio AS organization_subdominio,
              o.sector_comercial AS organization_sector,
              o.email AS organization_email,
              o.license_key AS organization_license_key,
              o.license_plan AS organization_license_plan,
              o.license_issued_at AS organization_license_issued_at,
              o.license_max_users AS organization_max_users,
              o.modulos_habilitados AS organization_modules,
              o.fel_habilitada AS organization_fel,
              o.subscription_status, o.trial_ends_at, o.subscription_ends_at
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos. Revisa los dos e inténtalo de nuevo.' });
    }

    const user = result.rows[0];

    if (!user.activo) {
      return res.status(401).json({ error: 'Usuario inactivo' });
    }

    // Verificar contraseña
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(user.password_hash);
    const passwordMatch = isBcryptHash && await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos. Revisa los dos e inténtalo de nuevo.' });
    }

    const organization = getOrganizationPayload(user);
    const organizationHasAccess = (organization.status === 'active' &&
      (!organization.subscriptionEndsAt || new Date(organization.subscriptionEndsAt).getTime() > Date.now())) ||
      (organization.status === 'trial' && organization.trialDaysRemaining > 0);
    if (!organizationHasAccess) {
      return res.status(403).json({
        error: organization.status === 'trial'
          ? 'Tu prueba gratuita ha finalizado. Contacta a soporte para activar tu suscripción.'
          : 'El acceso de tu empresa está suspendido.',
        code: organization.status === 'trial' ? 'TRIAL_EXPIRED' : 'ORGANIZATION_BLOCKED',
        organization
      });
    }

    // Rol, módulos y permisos efectivos según lo habilitado para la empresa
    const access = await resolveUserAccess(pool, user.id, user.organization_modules);
    const { roles, permissions, modules } = access;

    // Generar JWT
    const token = createToken(user, roles, permissions);

    // Actualizar último login
    await pool.query(
      'UPDATE users SET ultimo_login = NOW() WHERE id = $1',
      [user.id]
    );

    // En botengine-erp.com (o en el subdominio de otra empresa) la sesión se lleva al de la suya.
    entregarSesion(req, res, {
      token,
      hostDestino: dominios.hostEmpresa(user.organization_subdominio),
      pagina: 'index',
      body: {
      message: 'Login exitoso',
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        roles,
        permissions,
        modules,
        isAdmin: access.isAdmin,
        debeCambiarPassword: user.debe_cambiar_password === true,
        organization
      },
      organization
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en login' });
  }
};

// LOGOUT: Simplemente notificar (el token se invalida en el frontend)
const logout = (req, res) => {
  try {
    clearSessionCookie(res);
    res.status(200).json({ message: 'Logout exitoso' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error en logout' });
  }
};

// PERFIL: Obtener datos del usuario actual
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, email, nombre, apellido, telefono, activo, ultimo_login,
              debe_cambiar_password AS "debeCambiarPassword"
       FROM users WHERE id = $1 AND organization_id = $2`,
      [userId, req.organization.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const access = await resolveUserAccess(pool, userId, req.organization.modules);
    res.status(200).json({
      user: {
        ...result.rows[0],
        roles: access.roles,
        permissions: access.permissions,
        modules: access.modules,
        isAdmin: access.isAdmin,
        // Soporte ve la empresa sin pasar por el cambio de contraseña del usuario.
        ...(req.soporte ? { soporte: req.soporte, debeCambiarPassword: false } : {}),
        organization: req.organization
      },
      // Solo al venir de /api/auth/sesion (después de un traspaso).
      ...(res.locals.sessionExpiresAt ? { sessionExpiresAt: res.locals.sessionExpiresAt } : {})
    });
  } catch (error) {
    console.error('Error en getProfile:', error);
    res.status(500).json({ error: 'Error obteniendo perfil' });
  }
};

// Cambio de la contraseña propia, verificando la actual.
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const matches = result.rows[0] && await bcrypt.compare(String(currentPassword || ''), result.rows[0].password_hash);
    if (!matches) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    if (String(newPassword) === String(currentPassword)) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
    }
    await pool.query(
      'UPDATE users SET password_hash = $1, debe_cambiar_password = false, updated_at = NOW() WHERE id = $2',
      [await bcrypt.hash(String(newPassword), 10), req.user.id]
    );
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    console.error('Error en changePassword:', error);
    res.status(500).json({ error: 'Error cambiando la contraseña' });
  }
};

// Enlace del correo de verificación: confirma el correo, envía las credenciales y lleva al login.
const verifyEmail = async (req, res) => {
  const estado = await verificarCorreo(req.query.token);
  res.redirect(303, `/login.html?correo=${estado}`);
};

/**
 * POST /api/auth/traspaso { t } — llega en un formulario desde otra dirección (ver utils/traspaso.js).
 * Pone la cookie aquí y abre el inicio de sesión, que completa los datos y entra.
 */
const traspaso = (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { sessionToken, pagina } = usarTraspaso(req.body?.t, req.hostname);
    const { exp } = jwt.decode(sessionToken);
    setSessionCookie(res, sessionToken, Math.max(0, exp * 1000 - Date.now()));
    res.redirect(303, `/login.html?sesion=${pagina}`);
  } catch (error) {
    res.redirect(303, '/login.html?sesion=vencida');
  }
};

/** GET /api/auth/sesion — la sesión de esta dirección (para el navegador tras un traspaso). */
const sesionActual = async (req, res, next) => {
  try {
    const token = getSessionToken(req);
    const decoded = token ? jwt.verify(token, process.env.JWT_SECRET) : null;
    if (!decoded) return res.status(401).json({ error: 'No hay sesión' });
    const sessionExpiresAt = new Date(decoded.exp * 1000).toISOString();
    if (!decoded.platformAdmin) {
      res.locals.sessionExpiresAt = sessionExpiresAt;
      return next();
    }
    if (req.sitio?.tipo === 'empresa') return res.status(403).json({ error: 'El panel de soporte está en otra dirección' });
    const { rows } = await platformPool.query('SELECT id, email, nombre, activo FROM platform_admins WHERE id = $1', [decoded.platformAdminId]);
    if (!rows[0]?.activo) return res.status(401).json({ error: 'Cuenta de soporte inactiva' });
    const { token: _omitido, ...session } = platformSessionPayload(rows[0]);
    res.json({ ...session, sessionExpiresAt });
  } catch (error) {
    res.status(401).json({ error: 'La sesión venció; inicia sesión otra vez' });
  }
};

/** GET /api/auth/sitio — qué dirección es esta, para la pantalla de inicio de sesión. */
const sitio = (req, res) => {
  const tipo = req.sitio?.tipo || 'otro';
  res.json({
    tipo,
    base: dominios.baseDomain() || null,
    empresa: tipo === 'empresa' ? req.sitio.empresa : null,
    existe: tipo !== 'empresa' || Boolean(req.sitio.organizationId),
    urlRaiz: dominios.urlRaiz(),
    urlSoporte: dominios.urlSoporte()
  });
};

module.exports = {
  traspaso,
  sesionActual,
  sitio,
  crearSesionSoporte,
  salirDeSoporte,
  verifyEmail,
  changePassword,
  register,
  login,
  logout,
  getProfile
};
