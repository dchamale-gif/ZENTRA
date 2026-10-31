-- Migración: precios de venta calculados con margen de beneficio sobre el costo.
-- precio sugerido = precio de compra × (1 + margen / 100), redondeado hacia arriba.
-- El precio publicado sigue siendo precio_unitario: el sugerido se publica desde la
-- pantalla «Precios» (al punto de venta y, si está conectada, a la página web).
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

-- Margen propio del artículo (%); NULL = el margen por defecto de la empresa.
ALTER TABLE codigos_articulos ADD COLUMN IF NOT EXISTS margen NUMERIC(7,2);

CREATE TABLE IF NOT EXISTS config_precios (
    organization_id INTEGER PRIMARY KEY DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    margen_defecto NUMERIC(7,2) NOT NULL DEFAULT 30 CHECK (margen_defecto >= 0 AND margen_defecto <= 1000),
    -- A qué se redondea el precio sugerido, hacia arriba: 0.01 (centavo), 0.25, 0.50, 1 o 5 quetzales.
    redondeo NUMERIC(6,2) NOT NULL DEFAULT 0.01 CHECK (redondeo IN (0.01, 0.25, 0.50, 1, 5)),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE config_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_precios FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON config_precios;
CREATE POLICY tenant_isolation ON config_precios FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

COMMIT;
