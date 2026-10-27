const jwt = require('jsonwebtoken');
const pool = require('../db/authConnection');
const { runWithTenant } = require('../db/tenantContext');
const { getSessionToken } = require('../utils/sessionCookie');
const { moduleOfPermission, resolveUserAccess } = require('../utils/modules');

const hasOrganizationAccess = (organization) => {
  if (organization.subscription_status === 'active') {
    return !organization.subscription_ends_at ||
      new Date(organization.subscription_ends_at).getTime() > Date.now();
  }
  return organization.subscription_status === 'trial' &&
    new Date(organization.trial_ends_at).getTime() > Date.now();
};

// Middleware: Verificar JWT Token
const authMiddleware = async (req, res, next) => {
  try {
    const token = getSessionToken(req);

    if (!token) {
      console.log('❌ Sin token');
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token verificado:', decoded);
    
    // Obtener usuario de la BD para verificar que siga activo
    const result = await pool.query(
      `SELECT u.id, u.email, u.nombre, u.apellido, u.activo, u.organization_id, u.debe_cambiar_password,
              o.nombre AS organization_name, o.slug AS organization_slug,
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
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (!result.rows[0]) {
      console.log('❌ Usuario no encontrado:', decoded.userId);
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    if (!result.rows[0].activo) {
      console.log('❌ Usuario inactivo:', decoded.userId);
      return res.status(401).json({ error: 'Usuario inactivo' });
    }

    const user = result.rows[0];
    if (!hasOrganizationAccess(user)) {
      return res.status(403).json({
        error: user.subscription_status === 'trial'
          ? 'El período de prueba de tu empresa ha finalizado'
          : 'El acceso de tu empresa está suspendido',
        code: user.subscription_status === 'trial' ? 'TRIAL_EXPIRED' : 'ORGANIZATION_BLOCKED',
        organization: {
          id: user.organization_id,
          name: user.organization_name,
          status: user.subscription_status,
          trialEndsAt: user.trial_ends_at
        }
      });
    }

    // Con contraseña temporal solo se permite cambiarla (y ver el perfil o salir).
    if (user.debe_cambiar_password && !req.originalUrl.startsWith('/api/auth/')) {
      return res.status(403).json({
        error: 'Antes de continuar crea tu propia contraseña',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }

    console.log('✅ Usuario autenticado:', user.email);
    req.user = user;
    req.organization = {
      id: user.organization_id,
      name: user.organization_name,
      slug: user.organization_slug,
      sector: user.organization_sector,
      email: user.organization_email,
      licenseKey: user.organization_license_key,
      plan: user.organization_license_plan,
      maxUsers: user.organization_max_users,
      modules: user.organization_modules,
      felHabilitada: user.organization_fel === true,
      subscriptionEndsAt: user.subscription_ends_at,
      status: user.subscription_status,
      trialEndsAt: user.trial_ends_at
    };
    runWithTenant(user.organization_id, next);
  } catch (error) {
    console.error('❌ Error en authMiddleware:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Middleware: Verificar Rol y Permisos
const rolePermissionMiddleware = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      const access = await resolveUserAccess(pool, req.user.id, req.organization?.modules);
      if (access.roles.length === 0) {
        return res.status(403).json({ error: 'Usuario sin roles asignados' });
      }

      if (requiredPermissions.length > 0 &&
          !requiredPermissions.some((permission) => access.permissions.includes(permission))) {
        const moduleKey = moduleOfPermission(requiredPermissions[0]);
        const moduleDisabled = moduleKey && !access.enabledModules.includes(moduleKey);
        return res.status(403).json({
          error: moduleDisabled
            ? 'Este módulo no está habilitado para tu empresa'
            : 'No tienes permiso para esta acción; pide acceso al administrador',
          code: moduleDisabled ? 'MODULE_DISABLED' : 'PERMISSION_DENIED'
        });
      }

      req.userRoles = access.roles;
      req.userPermissions = access.permissions;
      req.userAccess = access;
      next();
    } catch (error) {
      console.error('Error en rolePermissionMiddleware:', error);
      res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
};

module.exports = {
  authMiddleware,
  rolePermissionMiddleware
};
