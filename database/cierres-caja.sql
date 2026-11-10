-- Migración: cierres de caja.
-- Todo cobro (venta de contado o abono) queda en pagos_factura con su método y quien cobró.
-- Al final del día el administrador revisa lo cobrado por cada cajera contra lo que recibió
-- (efectivo entregado, vouchers de tarjeta y transferencias vistas en la cuenta) y aprueba el
-- cierre; esos cobros quedan marcados con cierre_id y sus ventas ya no se pueden modificar.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS cierres_caja (
    id VARCHAR(50) PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    numero VARCHAR(20) NOT NULL,
    -- inicial: cobros anteriores a este módulo, cerrados sin revisar al instalarlo.
    estado VARCHAR(10) NOT NULL DEFAULT 'aprobado' CHECK (estado IN ('aprobado', 'inicial')),
    cajero_id INTEGER REFERENCES users(id),
    cajero_nombre VARCHAR(150),
    desde DATE,
    hasta DATE,
    cobros INTEGER NOT NULL DEFAULT 0,
    -- Lo que el sistema registró como cobrado.
    sistema_efectivo NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sistema_tarjeta NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sistema_transferencia NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sistema_otros NUMERIC(12, 2) NOT NULL DEFAULT 0,
    -- Lo que el administrador recibió o comprobó.
    recibido_efectivo NUMERIC(12, 2) NOT NULL DEFAULT 0,
    recibido_tarjeta NUMERIC(12, 2) NOT NULL DEFAULT 0,
    recibido_transferencia NUMERIC(12, 2) NOT NULL DEFAULT 0,
    recibido_otros NUMERIC(12, 2) NOT NULL DEFAULT 0,
    nota TEXT,
    aprobado_por INTEGER REFERENCES users(id),
    aprobado_por_nombre VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cierres_caja_numero ON cierres_caja (organization_id, numero);
CREATE INDEX IF NOT EXISTS idx_cierres_caja_cajero ON cierres_caja (organization_id, cajero_id, created_at DESC);

ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_caja FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON cierres_caja;
CREATE POLICY tenant_isolation ON cierres_caja FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        GRANT SELECT, INSERT, UPDATE ON cierres_caja TO zentra_tenant;
    END IF;
END $$;

-- Primera instalación: se agrega la columna y los cobros de antes de hoy quedan en un cierre
-- «inicial» por empresa, para no tener que cuadrar todo el historial. Los de hoy quedan pendientes.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pagos_factura' AND column_name = 'cierre_id'
    ) THEN
        ALTER TABLE pagos_factura ADD COLUMN cierre_id VARCHAR(50) REFERENCES cierres_caja(id);

        INSERT INTO cierres_caja (
            id, organization_id, numero, estado, cajero_nombre, desde, hasta, cobros,
            sistema_efectivo, sistema_tarjeta, sistema_transferencia, sistema_otros,
            recibido_efectivo, recibido_tarjeta, recibido_transferencia, recibido_otros, nota
        )
        SELECT 'CC-INICIAL-' || p.organization_id, p.organization_id, 'CC-INICIAL', 'inicial',
               'Todas las cajeras', MIN(p.fecha), MAX(p.fecha), COUNT(*),
               -- Sin cobros de un método la suma es NULL: se guarda 0 (sistema y recibido iguales).
               COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'efectivo'), 0),
               COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'tarjeta'), 0),
               COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'transferencia'), 0),
               COALESCE(SUM(p.monto) FILTER (WHERE lower(COALESCE(p.metodo_pago, '')) NOT IN ('efectivo', 'tarjeta', 'transferencia')), 0),
               COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'efectivo'), 0),
               COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'tarjeta'), 0),
               COALESCE(SUM(p.monto) FILTER (WHERE lower(p.metodo_pago) = 'transferencia'), 0),
               COALESCE(SUM(p.monto) FILTER (WHERE lower(COALESCE(p.metodo_pago, '')) NOT IN ('efectivo', 'tarjeta', 'transferencia')), 0),
               'Cobros anteriores al cierre de caja: se dieron por cerrados al instalarlo, sin revisión.'
        FROM pagos_factura p
        WHERE p.fecha < (NOW() AT TIME ZONE 'America/Guatemala')::date
        GROUP BY p.organization_id;

        UPDATE pagos_factura p SET cierre_id = 'CC-INICIAL-' || p.organization_id
        WHERE p.fecha < (NOW() AT TIME ZONE 'America/Guatemala')::date;
    END IF;
END $$;

-- Cobros pendientes de cierre por cajera.
CREATE INDEX IF NOT EXISTS idx_pagos_factura_sin_cierre
    ON pagos_factura (organization_id, usuario_id, created_at) WHERE cierre_id IS NULL;

COMMIT;
