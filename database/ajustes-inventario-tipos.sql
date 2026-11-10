-- Migración: tipos de ajuste de inventario configurables por empresa.
-- Cada tipo tiene un efecto: «conteo» (se escribe la existencia contada y se aplica la
-- diferencia), «salida» (descuenta) o «entrada» (suma). El administrador los crea, renombra y
-- desactiva. Cada ajuste guarda el nombre y el efecto del tipo con que se hizo.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

CREATE TABLE IF NOT EXISTS tipos_ajuste_inventario (
    id VARCHAR(50) PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT app_current_organization_id()
        REFERENCES organizations(id),
    nombre VARCHAR(60) NOT NULL,
    efecto VARCHAR(10) NOT NULL CHECK (efecto IN ('conteo', 'salida', 'entrada')),
    requiere_observaciones BOOLEAN NOT NULL DEFAULT false,
    activo BOOLEAN NOT NULL DEFAULT true,
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tipos_ajuste_nombre
    ON tipos_ajuste_inventario (organization_id, lower(nombre));

ALTER TABLE tipos_ajuste_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_ajuste_inventario FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tipos_ajuste_inventario;
CREATE POLICY tenant_isolation ON tipos_ajuste_inventario FOR ALL
    USING (organization_id = app_current_organization_id())
    WITH CHECK (organization_id = app_current_organization_id());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        GRANT SELECT, INSERT, UPDATE ON tipos_ajuste_inventario TO zentra_tenant;
    END IF;
END $$;

-- Tipos de fábrica para las empresas que aún no tienen ninguno (las nuevas los reciben al
-- abrir Ajustes de inventario). Son los tipos y motivos que antes estaban fijos.
INSERT INTO tipos_ajuste_inventario (id, organization_id, nombre, efecto, requiere_observaciones, orden)
SELECT 'TAJ-' || gen_random_uuid(), o.id, t.nombre, t.efecto, t.requiere, t.orden
FROM organizations o
CROSS JOIN (VALUES
    ('Carga inicial / conteo físico', 'conteo', false, 1),
    ('Muerte de animales', 'salida', false, 2),
    ('Producto dañado', 'salida', false, 3),
    ('Vencido', 'salida', false, 4),
    ('Consumo interno', 'salida', false, 5),
    ('Extravío o robo', 'salida', false, 6),
    ('Otro descuento', 'salida', true, 7),
    ('Entrada por ajuste', 'entrada', true, 8)
) AS t(nombre, efecto, requiere, orden)
WHERE NOT EXISTS (SELECT 1 FROM tipos_ajuste_inventario x WHERE x.organization_id = o.id);

-- Los ajustes guardan el tipo con que se hicieron; el tipo fijo anterior queda solo como historial.
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS tipo_ajuste_id VARCHAR(50) REFERENCES tipos_ajuste_inventario(id);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS tipo_nombre VARCHAR(60);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS efecto VARCHAR(10);
ALTER TABLE ajustes_inventario DROP CONSTRAINT IF EXISTS ajustes_inventario_tipo_check;
ALTER TABLE ajustes_inventario ALTER COLUMN tipo DROP NOT NULL;

-- Ajustes hechos con los tipos fijos: se pasan a los tipos equivalentes.
UPDATE ajustes_inventario a SET
    efecto = CASE WHEN a.tipo = 'carga_inicial' THEN 'conteo' ELSE 'salida' END,
    tipo_nombre = CASE
        WHEN a.tipo = 'carga_inicial' THEN 'Carga inicial / conteo físico'
        WHEN a.tipo = 'mortalidad' THEN 'Muerte de animales'
        WHEN a.motivo = 'danio' THEN 'Producto dañado'
        WHEN a.motivo = 'vencido' THEN 'Vencido'
        WHEN a.motivo = 'consumo_interno' THEN 'Consumo interno'
        WHEN a.motivo = 'extravio' THEN 'Extravío o robo'
        ELSE 'Otro descuento'
    END
WHERE a.tipo_nombre IS NULL AND a.tipo IS NOT NULL;

UPDATE ajustes_inventario a SET tipo_ajuste_id = t.id
FROM tipos_ajuste_inventario t
WHERE a.tipo_ajuste_id IS NULL AND t.organization_id = a.organization_id
  AND lower(t.nombre) = lower(a.tipo_nombre);

COMMIT;
