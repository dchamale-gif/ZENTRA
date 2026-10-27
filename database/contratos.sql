-- Migración: documentos de contratación (propuesta, contrato, Anexo A y acta) que soporte
-- envía al cliente al crear su empresa. Cada juego lleva un número BE-<año>-<correlativo>.
-- Es tabla de plataforma (sin RLS por empresa): solo el rol de autenticación la usa.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS contratos (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    anio INTEGER NOT NULL,
    correlativo INTEGER NOT NULL,
    numero VARCHAR(20) NOT NULL UNIQUE,
    -- Datos con los que se generaron los PDF, para poder volver a generarlos iguales.
    datos JSONB NOT NULL,
    enviado_en TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (anio, correlativo)
);
CREATE INDEX IF NOT EXISTS idx_contratos_organization ON contratos (organization_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_auth') THEN
        GRANT SELECT, INSERT, UPDATE ON contratos TO zentra_auth;
        GRANT USAGE, SELECT ON SEQUENCE contratos_id_seq TO zentra_auth;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        -- Los privilegios por defecto dan acceso a toda tabla nueva; esta no es de las empresas.
        REVOKE ALL ON contratos FROM zentra_tenant;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_platform') THEN
        REVOKE ALL ON contratos FROM zentra_platform;
    END IF;
END $$;

COMMIT;
