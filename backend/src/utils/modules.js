// Catálogo de módulos que se pueden habilitar por empresa y asignar por usuario.
// `permisos` son los prefijos de permiso del backend que pertenecen al módulo.
const MODULES = [
  { key: 'ventas', label: 'Ventas', permisos: ['ventas'] },
  { key: 'clientes', label: 'Clientes', permisos: ['clientes'] },
  { key: 'cobros', label: 'Cuentas por cobrar y estados de cuenta', permisos: ['cobros'] },
  { key: 'articulos', label: 'Artículos e inventario', permisos: ['inventario'] },
  { key: 'compras', label: 'Compras', permisos: ['compras'] },
  { key: 'proveedores', label: 'Proveedores', permisos: ['proveedores'] },
  { key: 'caja', label: 'Caja', permisos: ['caja'] },
  { key: 'gastos', label: 'Gastos y servicios', permisos: ['gastos'] },
  { key: 'finanzas', label: 'Dashboard ejecutivo y transacciones', permisos: ['finanzas'] },
  { key: 'reportes', label: 'Reportes', permisos: ['reportes'] }
];

const MODULE_KEYS = new Set(MODULES.map((module) => module.key));
const NIVELES = new Set(['ver', 'editar']);
const ACCIONES = { ver: ['view'], editar: ['view', 'create', 'edit', 'delete', 'export'] };
// Permisos que no pertenecen a un módulo: el administrador los tiene siempre.
const ADMIN_PERMISSIONS = ['dashboard_view', 'admin_users', 'admin_config', 'audit_view'];

const moduleOfPermission = (permission) => {
  const prefix = String(permission).split('_')[0];
  return MODULES.find((module) => module.permisos.includes(prefix))?.key || null;
};

// null en la base significa "todos los módulos".
const enabledModules = (organizationModules) => (
  Array.isArray(organizationModules)
    ? organizationModules.filter((key) => MODULE_KEYS.has(key))
    : [...MODULE_KEYS]
);

const permissionsFor = (moduleKey, nivel) => {
  const module = MODULES.find((entry) => entry.key === moduleKey);
  if (!module) return [];
  return module.permisos.flatMap((prefix) => ACCIONES[nivel].map((accion) => `${prefix}_${accion}`));
};

// Resuelve rol, módulos visibles y permisos efectivos de un usuario.
// `db` puede ser un pool o un cliente con .query.
const resolveUserAccess = async (db, userId, organizationModules) => {
  const enabled = enabledModules(organizationModules);
  const [rolesResult, accessResult, legacyResult] = await Promise.all([
    db.query(
      `SELECT r.nombre FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
      [userId]
    ),
    db.query('SELECT modulo, nivel FROM user_module_access WHERE user_id = $1', [userId]),
    db.query(
      `SELECT DISTINCT p.nombre FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND r.nombre <> 'admin'`,
      [userId]
    )
  ]);

  const roles = rolesResult.rows.map((row) => row.nombre);
  const isAdmin = roles.includes('admin');
  let modules;
  let permissions;

  if (isAdmin) {
    modules = enabled.map((key) => ({ modulo: key, nivel: 'editar' }));
    permissions = [...ADMIN_PERMISSIONS, ...enabled.flatMap((key) => permissionsFor(key, 'editar'))];
  } else {
    modules = accessResult.rows.filter((row) => enabled.includes(row.modulo));
    permissions = [
      'dashboard_view',
      ...modules.flatMap((row) => permissionsFor(row.modulo, row.nivel)),
      // Permisos heredados de roles anteriores, solo de módulos habilitados.
      ...legacyResult.rows.map((row) => row.nombre)
        .filter((name) => { const key = moduleOfPermission(name); return !key || enabled.includes(key); })
    ];
  }

  return {
    roles,
    isAdmin,
    modules,
    enabledModules: enabled,
    permissions: [...new Set(permissions)]
  };
};

module.exports = {
  MODULES,
  MODULE_KEYS,
  NIVELES,
  enabledModules,
  moduleOfPermission,
  permissionsFor,
  resolveUserAccess
};
