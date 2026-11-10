-- Migración: regularizaciones (ajustes) de inventario.
-- Carga inicial o conteo físico (se escribe la existencia contada), muerte de animales y
-- descuento de inventario (daño, vencimiento, consumo interno, extravío). Cada ajuste guarda la
-- existencia de antes y de después de cada artículo y se puede anular (se revierte).
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS ajustes_inventario (
    id VARCHAR(50) PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    numero VARCHAR(20) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('carga_inicial', 'mortalidad', 'descuento')),
    -- Descuento: daño, vencido, consumo interno, extravío u otro.
    motivo VARCHAR(30),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    observaciones TEXT,
    estado VARCHAR(10) NOT NULL DEFAULT 'aplicado' CHECK (estado IN ('aplicado', 'anulado')),
    user_id INTEGER REFERENCES users(id),
    usuario_nombre VARCHAR(150),
    anulado_at TIMESTAMP,
    anulado_por_nombre VARCHAR(150),
    motivo_anulacion TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ajustes_inventario_numero
    ON ajustes_inventario (organization_id, numero);
CREATE INDEX IF NOT EXISTS idx_ajustes_inventario_fecha ON ajustes_inventario (organization_id, fecha DESC);

CREATE TABLE IF NOT EXISTS ajuste_inventario_items (
    id VARCHAR(50) PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    ajuste_id VARCHAR(50) NOT NULL REFERENCES ajustes_inventario(id) ON DELETE CASCADE,
    articulo_id VARCHAR(50) NOT NULL REFERENCES codigos_articulos(id),
    existencia_anterior INTEGER NOT NULL,
    -- Diferencia aplicada: negativa en salidas; en carga inicial, lo que hubo que sumar o restar.
    cantidad INTEGER NOT NULL CHECK (cantidad <> 0),
    existencia_nueva INTEGER NOT NULL CHECK (existencia_nueva >= 0),
    -- Precio de compra del artículo en ese momento, para valorar la pérdida.
    costo_unitario DECIMAL(10, 2),
    nota VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ajuste_inventario_items_ajuste ON ajuste_inventario_items (ajuste_id);
CREATE INDEX IF NOT EXISTS idx_ajuste_inventario_items_articulo ON ajuste_inventario_items (articulo_id);

DO $$
DECLARE
    tenant_table TEXT;
BEGIN
    FOREACH tenant_table IN ARRAY ARRAY['ajustes_inventario', 'ajuste_inventario_items'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tenant_table);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())',
            tenant_table
        );
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO zentra_tenant', tenant_table);
        END IF;
    END LOOP;
END $$;

COMMIT;
