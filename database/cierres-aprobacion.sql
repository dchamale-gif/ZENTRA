-- Migración: el cierre de caja en dos pasos.
-- Quien tiene el módulo «Cierre de caja» cuenta lo recibido y registra el cierre; queda
-- «pendiente» con sus cobros apartados. El administrador (o quien tenga el módulo «Aprobar
-- cierres y depósitos») lo aprueba o lo rechaza; al rechazarlo los cobros vuelven a quedar
-- por cerrar. Si quien registra también puede aprobar, el cierre queda aprobado de una vez.
-- Idempotente.

BEGIN;

ALTER TABLE cierres_caja DROP CONSTRAINT IF EXISTS cierres_caja_estado_check;
ALTER TABLE cierres_caja ADD CONSTRAINT cierres_caja_estado_check
    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'inicial'));

ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS registrado_por INTEGER REFERENCES users(id);
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS registrado_por_nombre VARCHAR(150);
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS aprobado_at TIMESTAMPTZ;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS rechazado_por INTEGER REFERENCES users(id);
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS rechazado_por_nombre VARCHAR(150);
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS rechazado_at TIMESTAMPTZ;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

-- Los cierres anteriores los registró y aprobó la misma persona en el mismo momento.
UPDATE cierres_caja
SET registrado_por = COALESCE(registrado_por, aprobado_por),
    registrado_por_nombre = COALESCE(registrado_por_nombre, aprobado_por_nombre),
    aprobado_at = COALESCE(aprobado_at, created_at)
WHERE estado IN ('aprobado', 'inicial') AND aprobado_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cierres_caja_pendientes ON cierres_caja (organization_id, created_at) WHERE estado = 'pendiente';

-- Una sola vez: las empresas con lista de módulos que incluye «Cierre de caja» reciben también
-- «Aprobar cierres y depósitos», para poder asignárselo a un encargado de confianza.
DO $$
BEGIN
    IF to_regclass('public.schema_migraciones') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM schema_migraciones WHERE nombre = 'modulo-aprobaciones') THEN
        UPDATE organizations
        SET modulos_habilitados = array_append(modulos_habilitados, 'aprobaciones')
        WHERE modulos_habilitados IS NOT NULL
          AND 'cierres' = ANY(modulos_habilitados)
          AND NOT ('aprobaciones' = ANY(modulos_habilitados));
        INSERT INTO schema_migraciones (nombre) VALUES ('modulo-aprobaciones');
    END IF;
END $$;

COMMIT;
