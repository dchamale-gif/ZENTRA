-- ============================================
-- MIGRATION: ACTUALIZAR BD PARA LOGIN Y REGISTRO
-- ============================================
-- Archivo de migración para agregar funcionalidad de Login y Registro
-- Actualiza la base de datos existente sin perder datos
-- Ejecutar: psql -U postgres -d zentra -f database/migration-login-setup.sql
-- ============================================

BEGIN;

-- ============================================
-- 1. ACTUALIZAR TABLA USERS - AGREGAR COLUMNAS DE SEGURIDAD
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS verificado BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ultimo_login_fallido TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS intentos_login_fallidos INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verificado_en TIMESTAMP;

-- ============================================
-- 2. CREAR TABLA DE INTENTOS DE LOGIN
-- ============================================

CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    exitoso BOOLEAN DEFAULT false,
    razon_fallo VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

-- ============================================
-- 3. CREAR TABLA DE TOKENS DE RECUPERACIÓN
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(100) NOT NULL,
    usado BOOLEAN DEFAULT false,
    usado_en TIMESTAMP,
    expira_en TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. CREAR TABLA DE SESIONES ACTIVAS
-- ============================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    activa BOOLEAN DEFAULT true,
    login_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_en TIMESTAMP,
    ultima_actividad TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expira_en TIMESTAMP NOT NULL
);

-- ============================================
-- 5. CREAR ÍNDICES PARA OPTIMIZACIÓN
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_activo ON users(activo);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp ON login_attempts(timestamp);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_activa ON user_sessions(activa);

-- ============================================
-- 6. CREAR ROLES SI NO EXISTEN
-- ============================================

INSERT INTO roles (nombre, descripcion) VALUES
('admin', 'Administrador del sistema'),
('doctor', 'Médico - Acceso a pacientes y clínica'),
('enfermera', 'Enfermera - Acceso limitado a historias'),
('recepcionista', 'Recepcionista - Gestión de citas y datos pacientes'),
('gerente_compras', 'Gerente de Compras - Gestión de inventario'),
('contador', 'Contador - Acceso a finanzas y reportes'),
('paciente', 'Paciente - Acceso a su información')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================
-- 7. CREAR PERMISOS SI NO EXISTEN
-- ============================================

INSERT INTO permissions (nombre, descripcion, modulo, accion) VALUES
-- Dashboard
('dashboard_view', 'Ver dashboard', 'dashboard', 'view'),

-- Autenticación
('auth_login', 'Hacer login', 'auth', 'login'),
('auth_logout', 'Hacer logout', 'auth', 'logout'),
('auth_register', 'Registrarse', 'auth', 'register'),
('auth_profile', 'Ver perfil', 'auth', 'view'),
('auth_change_password', 'Cambiar contraseña', 'auth', 'edit'),

-- Pacientes
('pacientes_view', 'Ver pacientes', 'pacientes', 'view'),
('pacientes_create', 'Crear pacientes', 'pacientes', 'create'),
('pacientes_edit', 'Editar pacientes', 'pacientes', 'edit'),
('pacientes_delete', 'Eliminar pacientes', 'pacientes', 'delete'),

-- Historia Clínica
('historia_view', 'Ver historia clínica', 'historia_clinica', 'view'),
('historia_create', 'Crear registro clínico', 'historia_clinica', 'create'),
('historia_edit', 'Editar historia clínica', 'historia_clinica', 'edit'),

-- Medicinas
('medicinas_view', 'Ver medicinas', 'medicinas', 'view'),
('medicinas_edit', 'Editar medicinas', 'medicinas', 'edit'),
('medicinas_delete', 'Eliminar medicinas', 'medicinas', 'delete'),

-- Medicamentos
('medicamentos_view', 'Ver medicamentos asignados', 'medicamentos', 'view'),
('medicamentos_create', 'Asignar medicamentos', 'medicamentos', 'create'),
('medicamentos_edit', 'Editar medicamentos', 'medicamentos', 'edit'),
('medicamentos_delete', 'Eliminar medicamentos', 'medicamentos', 'delete'),

-- Compras
('compras_view', 'Ver compras', 'compras', 'view'),
('compras_create', 'Crear compras', 'compras', 'create'),
('compras_edit', 'Editar compras', 'compras', 'edit'),

-- Ventas
('ventas_view', 'Ver ventas', 'ventas', 'view'),
('ventas_create', 'Crear ventas', 'ventas', 'create'),

-- Caja
('caja_view', 'Ver caja', 'caja', 'view'),
('caja_edit', 'Editar movimientos caja', 'caja', 'edit'),

-- Clientes
('clientes_view', 'Ver clientes', 'clientes', 'view'),
('clientes_create', 'Crear clientes', 'clientes', 'create'),
('clientes_edit', 'Editar clientes', 'clientes', 'edit'),

-- Reportes
('reportes_view', 'Ver reportes', 'reportes', 'view'),
('reportes_export', 'Exportar reportes', 'reportes', 'export'),

-- Administración
('admin_users', 'Administrar usuarios', 'admin', 'all'),
('admin_config', 'Administrar configuración', 'admin', 'all'),
('audit_view', 'Ver logs de auditoría', 'audit', 'view')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================
-- 8. ASIGNAR PERMISOS A ROLES
-- ============================================

-- Permisos para ADMIN (todos los permisos)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.nombre = 'admin'
ON CONFLICT DO NOTHING;

-- Permisos para DOCTOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.nombre = 'doctor'
AND p.nombre IN (
    'dashboard_view', 'auth_login', 'auth_logout', 'auth_profile',
    'pacientes_view', 'pacientes_create', 'pacientes_edit',
    'historia_view', 'historia_create', 'historia_edit',
    'medicinas_view', 'medicamentos_view', 'medicamentos_create', 'medicamentos_edit',
    'servicios_facturados_view'
)
ON CONFLICT DO NOTHING;

-- Permisos para RECEPCIONISTA
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.nombre = 'recepcionista'
AND p.nombre IN (
    'dashboard_view', 'auth_login', 'auth_logout', 'auth_profile',
    'pacientes_view', 'pacientes_create', 'pacientes_edit',
    'clientes_view', 'clientes_create'
)
ON CONFLICT DO NOTHING;

-- Permisos para CONTADOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.nombre = 'contador'
AND p.nombre IN (
    'dashboard_view', 'auth_login', 'auth_logout', 'auth_profile',
    'ventas_view', 'compras_view', 'caja_view',
    'reportes_view', 'reportes_export'
)
ON CONFLICT DO NOTHING;

-- Permisos para PACIENTE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.nombre = 'paciente'
AND p.nombre IN (
    'auth_login', 'auth_logout', 'auth_profile', 'auth_change_password',
    'historia_view'
)
ON CONFLICT DO NOTHING;

-- ============================================
-- 9. CREAR USUARIO ADMIN POR DEFECTO
-- ============================================

-- Nota: La contraseña debe ser hasheada con bcrypt externamente
-- Esta es una contraseña temporal que debe cambiarse

INSERT INTO users (email, password_hash, nombre, apellido, telefono, activo, verificado)
VALUES (
    'admin@zentra.com',
    '$2a$10$DoxkQvJc9PQPjBbRhBG5.OHQkFvDLCfHWsHf3S8R7OW5EWKKYLPu.', -- bcrypt hash de 'admin123'
    'Admin',
    'Sistema',
    '+502-0000-0000',
    true,
    true
)
ON CONFLICT (email) DO NOTHING;

-- Asignar rol admin al usuario
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'admin@zentra.com'
AND r.nombre = 'admin'
ON CONFLICT DO NOTHING;

-- ============================================
-- 10. AGREGAR COMENTARIOS
-- ============================================

COMMENT ON TABLE login_attempts IS 'Registro de intentos de login (exitosos y fallidos)';
COMMENT ON TABLE password_reset_tokens IS 'Tokens para recuperación de contraseña';
COMMENT ON TABLE user_sessions IS 'Sesiones activas de usuarios';

-- ============================================
-- COMMIT
-- ============================================

COMMIT;

-- ============================================
-- CONFIRMACIÓN DE ÉXITO
-- ============================================

SELECT '✅ MIGRACIÓN COMPLETADA' AS resultado;
SELECT count(*) as total_users FROM users;
SELECT count(*) as total_roles FROM roles;
SELECT count(*) as total_permissions FROM permissions;
