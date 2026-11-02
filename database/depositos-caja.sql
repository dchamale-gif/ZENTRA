-- Migración: depósitos del efectivo de la caja al banco.
-- Quien maneja la caja (por ejemplo la recepcionista) registra el depósito con su boleta:
-- el monto sale de la caja en ese momento y el depósito queda «pendiente». Un administrador
-- lo confirma cuando lo ve en el banco, o lo rechaza y el dinero vuelve a contar en la caja.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS depositos_caja (
    id VARCHAR(50) PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id() REFERENCES organizations(id),
    fecha DATE NOT NULL,
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    cuenta_bancaria VARCHAR(120) NOT NULL,
    numero_boleta VARCHAR(60) NOT NULL,
    nota TEXT,
    -- Foto de la boleta (opcional), para que el administrador la compare con el banco.
    boleta_mime VARCHAR(30),
    boleta_datos BYTEA,
    estado VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'rechazado')),
    -- Egreso de caja que generó el depósito; se anula si el depósito se rechaza.
    caja_movimiento_id VARCHAR(50),
    registrado_por INTEGER REFERENCES users(id),
    revisado_por INTEGER REFERENCES users(id),
    revisado_at TIMESTAMPTZ,
    motivo_rechazo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_depositos_caja_estado ON depositos_caja (organization_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_depositos_caja_movimiento ON depositos_caja (caja_movimiento_id);
-- Una boleta no se registra dos veces en la misma cuenta (salvo que la primera se haya rechazado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_depositos_caja_boleta ON depositos_caja (organization_id, cuenta_bancaria, numero_boleta)
    WHERE estado <> 'rechazado';

ALTER TABLE depositos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE depositos_caja FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON depositos_caja;
CREATE POLICY tenant_isolation ON depositos_caja FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        GRANT SELECT, INSERT, UPDATE ON depositos_caja TO zentra_tenant;
    END IF;
END $$;

COMMIT;
