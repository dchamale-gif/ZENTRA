-- Migración: foto por artículo.
-- La foto llega en base64 (desde el sistema o la página web del cliente) y se
-- guarda decodificada; se sirve como imagen con caché en el navegador.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS articulo_fotos (
    articulo_id VARCHAR(50) PRIMARY KEY REFERENCES codigos_articulos(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    mime_type VARCHAR(20) NOT NULL,
    datos BYTEA NOT NULL,
    bytes INTEGER NOT NULL,
    -- Cambia con cada foto nueva: forma parte de la URL para que el navegador no muestre la anterior.
    hash VARCHAR(16) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_articulo_fotos_organization_id ON articulo_fotos (organization_id);

ALTER TABLE articulo_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE articulo_fotos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON articulo_fotos;
CREATE POLICY tenant_isolation ON articulo_fotos FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON articulo_fotos TO zentra_tenant;
    END IF;
END $$;

COMMIT;
