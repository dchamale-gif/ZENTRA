-- Migración: módulos habilitados por empresa y permisos por usuario.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

-- NULL = la empresa tiene todos los módulos.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS modulos_habilitados TEXT[];

-- Acceso de cada usuario (no administrador) por módulo: 'ver' o 'editar'.
CREATE TABLE IF NOT EXISTS user_module_access (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    modulo VARCHAR(30) NOT NULL,
    nivel VARCHAR(10) NOT NULL CHECK (nivel IN ('ver', 'editar')),
    PRIMARY KEY (user_id, modulo)
);

INSERT INTO roles (nombre, descripcion)
VALUES ('usuario', 'Usuario con acceso por módulos')
ON CONFLICT (nombre) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_auth') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_module_access TO zentra_auth;
        GRANT DELETE ON user_roles TO zentra_auth;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        REVOKE INSERT, UPDATE, DELETE ON user_module_access FROM zentra_tenant;
        GRANT SELECT ON user_module_access TO zentra_tenant;
    END IF;
END $$;

COMMIT;
