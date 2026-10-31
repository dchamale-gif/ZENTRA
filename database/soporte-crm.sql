-- Migración: el panel de soporte como CRM de clientes.
-- · Cuota mensual por empresa (para generar los cobros del mes).
-- · Facturas de BotEngine a sus clientes, con su estado de pago.
-- · Notas de seguimiento por empresa.
-- · Registro de cada vez que soporte entra a una empresa para ver lo que ve el cliente.
-- Son tablas de plataforma (sin RLS por empresa): solo el rol de autenticación las usa.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cuota_mensual NUMERIC(12,2);

-- La cuota de las empresas con contrato sale de la mensualidad del contrato más reciente.
UPDATE organizations o SET cuota_mensual = (c.datos->>'mensualidad')::NUMERIC
FROM (
    SELECT DISTINCT ON (organization_id) organization_id, datos
    FROM contratos ORDER BY organization_id, created_at DESC
) c
WHERE c.organization_id = o.id AND o.cuota_mensual IS NULL;

CREATE TABLE IF NOT EXISTS facturas_plataforma (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    anio INTEGER NOT NULL,
    correlativo INTEGER NOT NULL,
    numero VARCHAR(20) NOT NULL UNIQUE,
    -- Mes que cubre la mensualidad (día 1); null en cobros sueltos (implementación, extras).
    periodo DATE,
    -- [{ descripcion, cantidad, precio }], precios con IVA.
    items JSONB NOT NULL,
    total NUMERIC(12,2) NOT NULL CHECK (total > 0),
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
    pagada_en DATE,
    metodo_pago VARCHAR(30),
    referencia_pago VARCHAR(100),
    enviada_en TIMESTAMPTZ,
    enviada_a VARCHAR(150),
    creada_por INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (anio, correlativo)
);
CREATE INDEX IF NOT EXISTS idx_facturas_plataforma_organization ON facturas_plataforma (organization_id);
CREATE INDEX IF NOT EXISTS idx_facturas_plataforma_estado ON facturas_plataforma (estado, fecha_vencimiento);
-- Una sola mensualidad vigente por empresa y mes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_plataforma_periodo
    ON facturas_plataforma (organization_id, periodo)
    WHERE periodo IS NOT NULL AND estado <> 'anulada';

CREATE TABLE IF NOT EXISTS organizacion_notas (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    autor_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizacion_notas_organization ON organizacion_notas (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS soporte_accesos (
    id SERIAL PRIMARY KEY,
    platform_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    modo VARCHAR(10) NOT NULL CHECK (modo IN ('ver', 'editar')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_soporte_accesos_organization ON soporte_accesos (organization_id, created_at DESC);

DO $$
DECLARE
    tabla TEXT;
BEGIN
    FOREACH tabla IN ARRAY ARRAY['facturas_plataforma', 'organizacion_notas', 'soporte_accesos'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_auth') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO zentra_auth', tabla);
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO zentra_auth', tabla || '_id_seq');
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
            -- Los privilegios por defecto dan acceso a toda tabla nueva; estas no son de las empresas.
            EXECUTE format('REVOKE ALL ON %I FROM zentra_tenant', tabla);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_platform') THEN
            EXECUTE format('REVOKE ALL ON %I FROM zentra_platform', tabla);
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_auth') THEN
        GRANT DELETE ON organizacion_notas TO zentra_auth;
    END IF;
END $$;

COMMIT;
