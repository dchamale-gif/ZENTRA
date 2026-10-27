-- Migración: verificación de correo y credenciales demo al crear una empresa desde soporte.
-- Los enlaces de verificación son de plataforma (se abren sin sesión), así que la tabla
-- no lleva RLS por empresa: solo el rol de autenticación la usa.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    -- Solo se guarda el SHA-256 del token; el token completo viaja únicamente en el correo.
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens (user_id);

-- La contraseña temporal del correo de credenciales se cambia en el primer ingreso.
ALTER TABLE users ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_auth') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON email_verification_tokens TO zentra_auth;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zentra_auth;
        GRANT SELECT, INSERT, UPDATE ON organizations TO zentra_auth;
        GRANT INSERT ON user_roles TO zentra_auth;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        -- Los privilegios por defecto dan acceso a toda tabla nueva; esta no es de las empresas.
        REVOKE ALL ON email_verification_tokens FROM zentra_tenant;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_platform') THEN
        REVOKE ALL ON email_verification_tokens FROM zentra_platform;
    END IF;
END $$;

COMMIT;
