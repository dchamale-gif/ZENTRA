-- Migración: integraciones por empresa (por ahora, leer productos de la base de datos de su página web).
-- Las credenciales se guardan cifradas con una llave que solo tiene el servidor (INTEGRATIONS_KEY).
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS integraciones (
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    tipo VARCHAR(30) NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT true,
    -- Conexión y mapeo de columnas, sin la contraseña.
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Contraseña cifrada (AES-256-GCM, ligada a la empresa).
    secreto TEXT,
    ultima_sync_at TIMESTAMPTZ,
    ultima_sync_resultado JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, tipo)
);

ALTER TABLE integraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE integraciones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integraciones;
CREATE POLICY tenant_isolation ON integraciones FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

-- MD5 del valor original en la web: si no cambió, la foto no se vuelve a descargar.
-- NULL = la foto se subió a mano en el ERP y la sincronización no la toca.
ALTER TABLE articulo_fotos ADD COLUMN IF NOT EXISTS origen_hash VARCHAR(32);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON integraciones TO zentra_tenant;
    END IF;
END $$;

COMMIT;
