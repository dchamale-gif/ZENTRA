-- Migración: cómo paga cada empresa su suscripción a BotEngine.
-- · El administrador de la empresa elige al entrar la forma de pago: transferencia (sube el
--   comprobante desde el ERP) o tarjeta (paga con el enlace que configura soporte).
-- · Soporte decide desde su panel si la empresa paga mensual o anual (y en qué mes), la cuota
--   de cada período y el enlace de pago con tarjeta.
-- · Los comprobantes de transferencia quedan por revisar; soporte los acepta (la factura queda
--   pagada) o los rechaza con un motivo que el cliente ve.
-- Idempotente.

BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS forma_pago VARCHAR(15);
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_forma_pago_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_forma_pago_check
    CHECK (forma_pago IS NULL OR forma_pago IN ('transferencia', 'tarjeta'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS forma_pago_elegida_en TIMESTAMPTZ;
-- mensual: una factura cada mes; anual: una al año, en mes_cobro_anual (1 = enero).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS periodicidad VARCHAR(10) NOT NULL DEFAULT 'mensual';
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_periodicidad_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_periodicidad_check
    CHECK (periodicidad IN ('mensual', 'anual'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS mes_cobro_anual SMALLINT;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_mes_cobro_anual_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_mes_cobro_anual_check
    CHECK (mes_cobro_anual IS NULL OR mes_cobro_anual BETWEEN 1 AND 12);
-- Enlace de la pasarela para pagar con tarjeta (el mismo cada período).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enlace_pago TEXT;

-- Enlace propio de una factura (por ejemplo, un cobro suelto); si no hay, se usa el de la empresa.
ALTER TABLE facturas_plataforma ADD COLUMN IF NOT EXISTS enlace_pago TEXT;

CREATE TABLE IF NOT EXISTS facturas_plataforma_comprobantes (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER NOT NULL REFERENCES facturas_plataforma(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    archivo BYTEA NOT NULL,
    mime VARCHAR(40) NOT NULL,
    nombre_archivo VARCHAR(150),
    referencia VARCHAR(100),
    fecha_pago DATE,
    nota TEXT,
    estado VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptado', 'rechazado')),
    motivo_rechazo TEXT,
    subido_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subido_por_nombre VARCHAR(150),
    revisado_por INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
    revisado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fp_comprobantes_factura ON facturas_plataforma_comprobantes (factura_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fp_comprobantes_pendientes ON facturas_plataforma_comprobantes (created_at) WHERE estado = 'pendiente';

-- Igual que las facturas: solo el rol de autenticación (panel y suscripción del cliente) los toca.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_auth') THEN
        GRANT SELECT, INSERT, UPDATE ON facturas_plataforma_comprobantes TO zentra_auth;
        GRANT USAGE, SELECT ON SEQUENCE facturas_plataforma_comprobantes_id_seq TO zentra_auth;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        REVOKE ALL ON facturas_plataforma_comprobantes FROM zentra_tenant;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_platform') THEN
        REVOKE ALL ON facturas_plataforma_comprobantes FROM zentra_platform;
    END IF;
END $$;

COMMIT;
