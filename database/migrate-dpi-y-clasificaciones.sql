-- Migración: DPI en clientes y catálogo configurable de sección/familia/subfamilia.
-- Idempotente. Requiere haber ejecutado antes migrate-pacientes-a-clientes.sql.

BEGIN;

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dpi VARCHAR(13);
CREATE INDEX IF NOT EXISTS idx_clientes_dpi ON clientes (dpi);

CREATE TABLE IF NOT EXISTS clasificaciones_articulos (
    id VARCHAR(50) PRIMARY KEY,
    nivel VARCHAR(12) NOT NULL CHECK (nivel IN ('seccion', 'familia', 'subfamilia')),
    nombre VARCHAR(150) NOT NULL,
    padre_id VARCHAR(50) REFERENCES clasificaciones_articulos(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_clasificaciones_organization_id ON clasificaciones_articulos (organization_id);
CREATE INDEX IF NOT EXISTS idx_clasificaciones_padre ON clasificaciones_articulos (padre_id);
ALTER TABLE clasificaciones_articulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clasificaciones_articulos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON clasificaciones_articulos;
CREATE POLICY tenant_isolation ON clasificaciones_articulos FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON clasificaciones_articulos TO zentra_tenant;
    END IF;
END $$;

COMMIT;
