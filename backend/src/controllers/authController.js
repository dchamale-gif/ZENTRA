const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db/authConnection');
const platformPool = require('../db/platformConnection');
const { clearSessionCookie, setSessionCookie } = require('../utils/sessionCookie');

const TRIAL_DAYS = 30;

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
    sector: row.organization_sector,
    email: row.organization_email,
    licenseKey: row.organization_license_key,
    plan: row.organization_license_plan,
    licenseIssuedAt: row.organization_license_issued_at,
    maxUsers: row.organization_max_users,
    status: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
    subscriptionEndsAt: row.subscription_ends_at,
    trialDaysRemaining: row.subscription_status === 'trial'
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000))
      : null
  };
};

const createToken = (user, roles, permissions) => jwt.sign(
  {
    userId: user.id,
    organizationId: user.organization_id,
    email: user.email,
    roles,
    permissions
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRATION || '7d' }
);

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

  return {
    message: 'Acceso de soporte exitoso',
    token: createPlatformToken(platformAdmin),
    platformAdmin: true,
    user: {
      id: platformAdmin.id,
      email: platformAdmin.email,
      nombre: platformAdmin.nombre,
      roles: ['platform_admin'],
      platformAdmin: true
    }
  };
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
      empresaDireccion
    } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedCompanyName = String(empresaNombre || '').trim();
    const normalizedCompanyEmail = String(empresaCorreo || normalizedEmail).trim().toLowerCase();
    const normalizedSector = String(empresaSector || '').trim();

    if (!normalizedEmail || !password || !nombre?.trim() || !apellido?.trim() ||
        !normalizedCompanyName || !normalizedSector || !normalizedCompanyEmail) {
      return res.status(400).json({
        error: 'Campos requeridos: empresaNombre, empresaSector, empresaCorreo, email, password, nombre, apellido'
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedCompanyEmail)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
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

    const hashedPassword = await bcrypt.hash(password, 10);
    const organizationResult = await client.query(
      `INSERT INTO organizations
       (nombre, slug, nit, sector_comercial, email, telefono, direccion,
        license_key, license_plan, license_issued_at,
        subscription_status, trial_started_at, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Trial', NOW(), 'trial', NOW(), NOW() + ($9 * INTERVAL '1 day'))
       RETURNING id, nombre, slug, sector_comercial, email, license_key, license_plan,
                 license_issued_at, license_max_users, subscription_status, trial_ends_at`,
      [
        normalizedCompanyName,
        buildSlug(normalizedCompanyName),
        empresaNit?.trim() || null,
        normalizedSector,
        normalizedCompanyEmail,
        empresaTelefono?.trim() || null,
        empresaDireccion?.trim() || null,
        generateLicenseKey(),
        TRIAL_DAYS
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
    const roles = ['admin'];
    const permissionsResult = await client.query(
      `SELECT p.nombre FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       JOIN roles r ON r.id = rp.role_id
       WHERE r.nombre = 'admin'`
    );
    const permissions = permissionsResult.rows.map(row => row.nombre);
    await client.query('COMMIT');
    const organizationData = getOrganizationPayload({
      organization_id: organization.id,
      organization_name: organization.nombre,
      organization_slug: organization.slug,
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
    const sessionExpiresAt = setSessionCookie(res, token);
    res.status(201).json({
      message: `Empresa registrada. Tu prueba de ${TRIAL_DAYS} días ha comenzado.`,
      sessionExpiresAt,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        roles,
        permissions,
        organization: organizationData
      },
      organization: organizationData
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
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
      const sessionExpiresAt = setSessionCookie(res, platformSession.token);
      delete platformSession.token;
      return res.status(200).json({ ...platformSession, sessionExpiresAt });
    }

    const result = await pool.query(
      `SELECT u.id, u.organization_id, u.email, u.password_hash, u.nombre, u.apellido, u.activo,
              o.nombre AS organization_name, o.slug AS organization_slug,
              o.sector_comercial AS organization_sector,
              o.email AS organization_email,
              o.license_key AS organization_license_key,
              o.license_plan AS organization_license_plan,
              o.license_issued_at AS organization_license_issued_at,
              o.license_max_users AS organization_max_users,
              o.subscription_status, o.trial_ends_at, o.subscription_ends_at
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    if (!user.activo) {
      return res.status(401).json({ error: 'Usuario inactivo' });
    }

    // Verificar contraseña
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(user.password_hash);
    const passwordMatch = isBcryptHash && await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
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

    // Obtener roles y permisos
    const rolesResult = await pool.query(
      `SELECT r.nombre FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const permissionsResult = await pool.query(
      `SELECT p.nombre FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = $1
       GROUP BY p.nombre`,
      [user.id]
    );

    const roles = rolesResult.rows.map(r => r.nombre);
    const permissions = permissionsResult.rows.map(p => p.nombre);

    // Generar JWT
    const token = createToken(user, roles, permissions);
    const sessionExpiresAt = setSessionCookie(res, token);

    // Actualizar último login
    await pool.query(
      'UPDATE users SET ultimo_login = NOW() WHERE id = $1',
      [user.id]
    );

    res.status(200).json({
      message: 'Login exitoso',
      sessionExpiresAt,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        roles: roles,
        permissions: permissions,
        organization
      },
      organization
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
      `SELECT id, email, nombre, apellido, telefono, activo, ultimo_login
       FROM users WHERE id = $1 AND organization_id = $2`,
      [userId, req.organization.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.status(200).json({
      user: {
        ...result.rows[0],
        organization: req.organization
      }
    });
  } catch (error) {
    console.error('Error en getProfile:', error);
    res.status(500).json({ error: 'Error obteniendo perfil' });
  }
};

module.exports = {
  register,
  login,
  logout,
  getProfile
};
