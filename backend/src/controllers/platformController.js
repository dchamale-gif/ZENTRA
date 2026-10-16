const crypto = require('crypto');
const pool = require('../db/platformConnection');
const { MODULES, MODULE_KEYS } = require('../utils/modules');

const LICENSE_STATUSES = new Set(['trial', 'active', 'suspended', 'cancelled']);
const DEFAULT_MAX_USERS = 3;

// Devuelve el número de usuarios validado, o null si no es válido.
const parseMaxUsers = (value) => {
  const maxUsers = Number(value);
  return Number.isInteger(maxUsers) && maxUsers >= 1 && maxUsers <= 1000 ? maxUsers : null;
};

const ACTIVE_USERS_SQL = `(SELECT COUNT(*) FROM users u WHERE u.organization_id = organizations.id AND u.activo)::INTEGER AS active_users`;

const generateLicenseKey = () => {
  const value = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
};

const mapOrganization = (row) => ({
  id: row.id,
  name: row.nombre,
  sector: row.sector_comercial,
  email: row.email,
  nit: row.nit,
  status: row.subscription_status,
  plan: row.license_plan,
  licenseKey: row.license_key,
  licenseIssuedAt: row.license_issued_at,
  maxUsers: row.license_max_users,
  // null = todos los módulos habilitados
  modules: row.modulos_habilitados ?? null,
  activeUsers: Number(row.active_users || 0),
  trialEndsAt: row.trial_ends_at,
  subscriptionStartedAt: row.subscription_started_at,
  subscriptionEndsAt: row.subscription_ends_at,
  daysRemaining: Number(row.days_remaining || 0),
  createdAt: row.created_at
});

const listOrganizations = async (req, res) => {
  try {
    const expiringIn = Math.min(Math.max(Number(req.query.expiringIn) || 30, 1), 3650);
    const result = await pool.query(
      `SELECT id, nombre, sector_comercial, email, nit, subscription_status,
              license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, trial_ends_at,
              subscription_started_at, subscription_ends_at, created_at,
              ${ACTIVE_USERS_SQL},
              GREATEST(
                0,
                CEIL(EXTRACT(EPOCH FROM (
                  COALESCE(subscription_ends_at, trial_ends_at) - NOW()
                )) / 86400)
              ) AS days_remaining
       FROM organizations
       WHERE subscription_status IN ('trial', 'active')
          OR COALESCE(subscription_ends_at, trial_ends_at)
             <= NOW() + ($1 * INTERVAL '1 day')
       ORDER BY COALESCE(subscription_ends_at, trial_ends_at) ASC, created_at DESC`,
      [expiringIn]
    );

    res.json({
      success: true,
      organizations: result.rows.map(mapOrganization)
    });
  } catch (error) {
    console.error('Error listando organizaciones:', error);
    res.status(500).json({ error: 'Error obteniendo empresas' });
  }
};

const getOrganization = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.nombre, o.sector_comercial, o.email, o.nit,
              o.subscription_status, o.license_plan, o.license_key,
              o.license_issued_at, o.license_max_users, o.modulos_habilitados, o.trial_ends_at,
              o.subscription_started_at, o.subscription_ends_at, o.created_at,
              COUNT(u.id)::INTEGER AS user_count,
              (COUNT(u.id) FILTER (WHERE u.activo))::INTEGER AS active_users
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json({ success: true, organization: mapOrganization(result.rows[0]), users: result.rows[0].user_count });
  } catch (error) {
    console.error('Error obteniendo organización:', error);
    res.status(500).json({ error: 'Error obteniendo empresa' });
  }
};

const createOrganization = async (req, res) => {
  try {
    const {
      name,
      sector,
      email,
      nit,
      plan = 'Demo',
      durationDays = 30,
      maxUsers = DEFAULT_MAX_USERS
    } = req.body;
    const days = Number(durationDays);
    const userLimit = parseMaxUsers(maxUsers);
    if (!String(name || '').trim() || !String(sector || '').trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
      return res.status(400).json({ error: 'Nombre, sector y correo válido son requeridos' });
    }
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return res.status(400).json({ error: 'La duración debe estar entre 1 y 3650 días' });
    }
    if (!userLimit) {
      return res.status(400).json({ error: 'Los usuarios permitidos deben estar entre 1 y 1000' });
    }

    const result = await pool.query(
      `INSERT INTO organizations
       (nombre, slug, sector_comercial, email, nit, subscription_status,
        license_plan, license_key, license_issued_at, license_max_users,
        trial_started_at, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, 'trial', $6, $7, NOW(), $9, NOW(), NOW() + ($8 * INTERVAL '1 day'))
       RETURNING id, nombre, sector_comercial, email, nit, subscription_status,
                 license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, trial_ends_at,
                 subscription_started_at, subscription_ends_at, created_at,
                 $8 AS days_remaining`,
      [
        String(name).trim().slice(0, 150),
        `${String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}`,
        String(sector).trim().slice(0, 150),
        String(email).trim().toLowerCase(),
        nit ? String(nit).trim().slice(0, 30) : null,
        String(plan).trim().slice(0, 50) || 'Demo',
        generateLicenseKey(),
        days,
        userLimit
      ]
    );
    res.status(201).json({
      success: true,
      message: 'Empresa agregada al panel',
      organization: mapOrganization(result.rows[0])
    });
  } catch (error) {
    console.error('Error creando organización desde soporte:', error);
    res.status(500).json({ error: 'Error agregando empresa' });
  }
};

// Impide bajar la capacidad por debajo de los usuarios que ya están activos.
const checkActiveUsersFit = async (organizationId, userLimit) => {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::INTEGER AS active_users FROM users WHERE organization_id = $1 AND activo',
    [organizationId]
  );
  const activeUsers = rows[0].active_users;
  return activeUsers > userLimit
    ? `La empresa tiene ${activeUsers} usuarios activos; desactiva algunos antes de bajar la licencia a ${userLimit}.`
    : null;
};

const updateUserLimit = async (req, res) => {
  try {
    const userLimit = parseMaxUsers(req.body.maxUsers);
    if (!userLimit) {
      return res.status(400).json({ error: 'Los usuarios permitidos deben estar entre 1 y 1000' });
    }
    const limitError = await checkActiveUsersFit(req.params.id, userLimit);
    if (limitError) return res.status(409).json({ error: limitError });

    const result = await pool.query(
      `UPDATE organizations
       SET license_max_users = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, nombre, sector_comercial, email, nit, subscription_status,
                 license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, trial_ends_at,
                 subscription_started_at, subscription_ends_at, created_at,
                 ${ACTIVE_USERS_SQL},
                 GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
                   COALESCE(subscription_ends_at, trial_ends_at) - NOW()
                 )) / 86400)) AS days_remaining`,
      [userLimit, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json({
      success: true,
      message: `Licencia actualizada a ${userLimit} usuarios`,
      organization: mapOrganization(result.rows[0])
    });
  } catch (error) {
    console.error('Error actualizando usuarios de la licencia:', error);
    res.status(500).json({ error: 'Error actualizando usuarios de la licencia' });
  }
};

const listModules = (req, res) => {
  res.json({ success: true, modules: MODULES.map(({ key, label }) => ({ key, label })) });
};

// Habilita o quita módulos a una empresa; los usuarios dejan de verlos al recargar.
const updateModules = async (req, res) => {
  try {
    const { modules } = req.body;
    if (!Array.isArray(modules) || modules.some((key) => !MODULE_KEYS.has(key))) {
      return res.status(400).json({ error: 'Lista de módulos no válida' });
    }
    const all = modules.length === MODULE_KEYS.size;
    const result = await pool.query(
      `UPDATE organizations SET modulos_habilitados = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, nombre, sector_comercial, email, nit, subscription_status,
                 license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, trial_ends_at,
                 subscription_started_at, subscription_ends_at, created_at,
                 ${ACTIVE_USERS_SQL},
                 GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
                   COALESCE(subscription_ends_at, trial_ends_at) - NOW()
                 )) / 86400)) AS days_remaining`,
      [all ? null : [...new Set(modules)], req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json({
      success: true,
      message: all ? 'La empresa tiene todos los módulos' : `Módulos actualizados (${modules.length} habilitados)`,
      organization: mapOrganization(result.rows[0])
    });
  } catch (error) {
    console.error('Error actualizando módulos:', error);
    res.status(500).json({ error: 'Error actualizando módulos' });
  }
};

const updateLicense = async (req, res) => {
  try {
    const {
      status = 'active',
      plan = 'Demo',
      durationDays = 365,
      generateNewKey = false,
      maxUsers
    } = req.body;
    const days = Number(durationDays);
    const userLimit = maxUsers === undefined || maxUsers === null ? null : parseMaxUsers(maxUsers);
    if (!LICENSE_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Estado de licencia inválido' });
    }
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return res.status(400).json({ error: 'La duración debe estar entre 1 y 3650 días' });
    }
    if (maxUsers !== undefined && maxUsers !== null && !userLimit) {
      return res.status(400).json({ error: 'Los usuarios permitidos deben estar entre 1 y 1000' });
    }
    if (userLimit) {
      const limitError = await checkActiveUsersFit(req.params.id, userLimit);
      if (limitError) return res.status(409).json({ error: limitError });
    }

    const newKey = generateLicenseKey();
    const result = await pool.query(
      `UPDATE organizations
       SET subscription_status = $1,
           license_plan = $2,
           license_key = CASE WHEN $6 = true THEN $3 ELSE COALESCE(license_key, $3) END,
           license_issued_at = CASE WHEN $6 = true OR license_issued_at IS NULL THEN NOW() ELSE license_issued_at END,
           license_max_users = COALESCE($7::INTEGER, license_max_users),
           subscription_started_at = CASE WHEN $1 = 'active' THEN NOW() ELSE subscription_started_at END,
           subscription_ends_at = CASE WHEN $1 = 'active'
             THEN NOW() + ($4 * INTERVAL '1 day')
             ELSE subscription_ends_at
           END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, nombre, sector_comercial, email, nit, subscription_status,
                 license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, trial_ends_at,
                 subscription_started_at, subscription_ends_at, created_at,
                 ${ACTIVE_USERS_SQL},
                 GREATEST(
                   0,
                   CEIL(EXTRACT(EPOCH FROM (
                     COALESCE(
                       CASE WHEN $1 = 'active' THEN NOW() + ($4 * INTERVAL '1 day') ELSE subscription_ends_at END,
                       trial_ends_at
                     ) - NOW()
                   )) / 86400)
                 ) AS days_remaining`,
      [status, String(plan).trim().slice(0, 50) || 'Demo', newKey, days, req.params.id, Boolean(generateNewKey), userLimit]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    res.json({
      success: true,
      message: status === 'active'
        ? (generateNewKey ? `Nueva licencia generada: ${result.rows[0].license_key}` : 'Licencia habilitada')
        : `Licencia marcada como ${status}`,
      organization: mapOrganization(result.rows[0])
    });
  } catch (error) {
    console.error('Error actualizando licencia:', error);
    res.status(500).json({ error: 'Error actualizando licencia' });
  }
};

module.exports = {
  createOrganization,
  listOrganizations,
  getOrganization,
  updateLicense,
  updateUserLimit,
  listModules,
  updateModules
};
