-- Migración: punto de venta.
-- Cuentas abiertas (un cliente en mostrador, un pedido, una mesa) a las que varios usuarios agregan
-- productos a la vez; al cobrarlas se convierten en una venta normal.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS pos_cuentas (
    id VARCHAR(50) PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    nombre VARCHAR(80) NOT NULL,
    estado VARCHAR(12) NOT NULL DEFAULT 'abierta'
        CHECK (estado IN ('abierta', 'cobrada', 'anulada')),
    venta_id VARCHAR(50) REFERENCES ventas(id) ON DELETE SET NULL,
    abierta_por INTEGER REFERENCES users(id),
    abierta_por_nombre VARCHAR(150),
    -- Sube con cada cambio: los clientes comparan la versión para saber si refrescar.
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

-- Dos usuarios no pueden abrir a la vez dos cuentas con el mismo nombre.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_cuentas_nombre_abierta
    ON pos_cuentas (organization_id, lower(nombre)) WHERE estado = 'abierta';
CREATE INDEX IF NOT EXISTS idx_pos_cuentas_organization_id ON pos_cuentas (organization_id);

CREATE TABLE IF NOT EXISTS pos_cuenta_items (
    id VARCHAR(50) PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    cuenta_id VARCHAR(50) NOT NULL REFERENCES pos_cuentas(id) ON DELETE CASCADE,
    articulo_id VARCHAR(50) NOT NULL REFERENCES codigos_articulos(id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(10, 2) NOT NULL CHECK (precio_unitario >= 0),
    nota VARCHAR(120) NOT NULL DEFAULT '',
    user_id INTEGER REFERENCES users(id),
    usuario_nombre VARCHAR(150),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Una línea por producto, nota y usuario: si el mismo usuario vuelve a tocar el
-- producto se suma a su línea; otro usuario tiene la suya y no se pisan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_cuenta_items_linea
    ON pos_cuenta_items (cuenta_id, articulo_id, nota, user_id);
CREATE INDEX IF NOT EXISTS idx_pos_cuenta_items_organization_id ON pos_cuenta_items (organization_id);

DO $$
DECLARE
    tenant_table TEXT;
BEGIN
    FOREACH tenant_table IN ARRAY ARRAY['pos_cuentas', 'pos_cuenta_items'] LOOP
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
