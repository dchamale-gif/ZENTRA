-- Migración: Factura Electrónica en Línea (FEL, SAT Guatemala).
-- La configuración de cada empresa (emisor, régimen, certificador) vive en
-- integraciones (tipo 'fel'); las credenciales del certificador van cifradas.
-- Cada factura certificada o intentada queda en fel_documentos.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS fel_documentos (
    id VARCHAR(50) PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    venta_id VARCHAR(50) NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    tipo_dte VARCHAR(4) NOT NULL,
    -- pendiente: enviándose · certificado · error: el certificador la rechazó o no respondió · anulado
    estado VARCHAR(12) NOT NULL CHECK (estado IN ('pendiente', 'certificado', 'error', 'anulado')),
    certificador VARCHAR(30) NOT NULL,
    ambiente VARCHAR(12) NOT NULL,
    receptor_id VARCHAR(20) NOT NULL,
    receptor_tipo VARCHAR(4),
    receptor_nombre VARCHAR(400) NOT NULL,
    total DECIMAL(12, 2) NOT NULL,
    fecha_emision TIMESTAMPTZ NOT NULL,
    uuid VARCHAR(36),
    serie VARCHAR(20),
    numero VARCHAR(15),
    fecha_certificacion TIMESTAMPTZ,
    xml_enviado TEXT,
    xml_certificado TEXT,
    error TEXT,
    anulacion_motivo VARCHAR(255),
    anulado_at TIMESTAMPTZ,
    xml_anulacion TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una venta tiene a lo sumo una factura vigente (o en proceso).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fel_documentos_venta_vigente
    ON fel_documentos (venta_id) WHERE estado IN ('pendiente', 'certificado');
CREATE INDEX IF NOT EXISTS idx_fel_documentos_venta ON fel_documentos (venta_id);
CREATE INDEX IF NOT EXISTS idx_fel_documentos_organization_id ON fel_documentos (organization_id);

ALTER TABLE fel_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fel_documentos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fel_documentos;
CREATE POLICY tenant_isolation ON fel_documentos FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON fel_documentos TO zentra_tenant;
    END IF;
END $$;

COMMIT;
