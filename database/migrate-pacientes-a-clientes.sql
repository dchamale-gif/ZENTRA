-- Migración: pacientes -> clientes
-- Ejecutar una sola vez, con respaldo previo. Es destructiva en su sección final.

BEGIN;

-- 1. Campos nuevos para la gestión de clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion VARCHAR(255);

ALTER TABLE caja ADD COLUMN IF NOT EXISTS cliente_id VARCHAR(50) REFERENCES clientes(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id VARCHAR(50) REFERENCES clientes(id);
ALTER TABLE cuentas_por_cobrar ADD COLUMN IF NOT EXISTS cliente_id VARCHAR(50) REFERENCES clientes(id);

-- 1b. Tabla de pagos de facturas (cuentas por cobrar), aislada por organización
CREATE TABLE IF NOT EXISTS pagos_factura (
    id VARCHAR(50) PRIMARY KEY,
    venta_id VARCHAR(50) NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    monto DECIMAL(12, 2) NOT NULL CHECK (monto > 0),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    metodo_pago VARCHAR(50),
    observaciones TEXT,
    usuario_id INTEGER REFERENCES users(id),
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pagos_factura_venta ON pagos_factura (venta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_factura_organization_id ON pagos_factura (organization_id);
ALTER TABLE pagos_factura ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_factura FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pagos_factura;
CREATE POLICY tenant_isolation ON pagos_factura FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON pagos_factura TO zentra_tenant;
    END IF;
END $$;

-- 2. Conservar el vínculo histórico paciente -> cliente cuando exista
DO $$
BEGIN
    IF to_regclass('paciente_cliente') IS NOT NULL THEN
        UPDATE ventas v SET cliente_id = pc.cliente_id
        FROM paciente_cliente pc
        WHERE v.cliente_id IS NULL AND v.paciente_id = pc.paciente_id;

        UPDATE caja c SET cliente_id = pc.cliente_id
        FROM paciente_cliente pc
        WHERE c.cliente_id IS NULL AND c.paciente_id = pc.paciente_id;

        UPDATE cuentas_por_cobrar cc SET cliente_id = pc.cliente_id
        FROM paciente_cliente pc
        WHERE cc.cliente_id IS NULL AND cc.paciente_id = pc.paciente_id;
    END IF;
END $$;

-- 3. Permiso de baja de clientes
INSERT INTO permissions (nombre, descripcion, modulo, accion)
VALUES ('clientes_delete', 'Dar de baja clientes', 'clientes', 'delete')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.nombre = 'admin' AND p.nombre IN ('clientes_view', 'clientes_create', 'clientes_edit', 'clientes_delete')
ON CONFLICT DO NOTHING;

-- 4. Retirar columnas y tablas de pacientes (DESTRUCTIVO)
ALTER TABLE ventas DROP COLUMN IF EXISTS paciente_id;
ALTER TABLE caja DROP COLUMN IF EXISTS paciente_id;
ALTER TABLE cuentas_por_cobrar DROP COLUMN IF EXISTS paciente_id;

DROP TABLE IF EXISTS movimientos_paciente CASCADE;
DROP TABLE IF EXISTS pacientes_saldo CASCADE;
DROP TABLE IF EXISTS medicamentos_paciente CASCADE;
DROP TABLE IF EXISTS diagnosticos_paciente CASCADE;
DROP TABLE IF EXISTS documentos_paciente CASCADE;
DROP TABLE IF EXISTS responsables_paciente CASCADE;
DROP TABLE IF EXISTS paciente_cliente CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;

COMMIT;
