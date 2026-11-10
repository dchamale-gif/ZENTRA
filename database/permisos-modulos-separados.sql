-- Migración: Punto de venta, Precios, Ajustes de inventario y Cierre de caja pasan a ser
-- módulos con permiso propio (antes iban dentro de Ventas, Artículos y el rol administrador).
-- Para que nadie pierda ni gane acceso, UNA SOLA VEZ:
--   · quien tenía Ventas recibe Punto de venta con el mismo nivel;
--   · quien tenía Artículos recibe Precios y Ajustes de inventario con el mismo nivel;
--   · las empresas con una lista de módulos reciben los nuevos que correspondan
--     (Ventas → Punto de venta; Artículos → Precios y Ajustes; Caja → Cierre de caja).
-- Cierre de caja no se da a ningún usuario: antes era solo del administrador, que lo tiene siempre.
-- Si se repitiera, devolvería accesos que el administrador quitó a propósito; por eso queda anotada
-- en schema_migraciones.

BEGIN;

-- Migraciones que solo deben correr una vez (no es una tabla de empresa).
CREATE TABLE IF NOT EXISTS schema_migraciones (
    nombre VARCHAR(100) PRIMARY KEY,
    aplicada_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$
BEGIN
    -- Los privilegios por defecto dan acceso a toda tabla nueva; esta solo la usa la migración.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        REVOKE ALL ON schema_migraciones FROM zentra_tenant;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migraciones WHERE nombre = 'permisos-modulos-separados') THEN
        INSERT INTO user_module_access (user_id, modulo, nivel)
        SELECT a.user_id, n.nuevo, a.nivel
        FROM user_module_access a
        JOIN (VALUES ('ventas', 'pos'), ('articulos', 'precios'), ('articulos', 'ajustes')) AS n(viejo, nuevo)
          ON n.viejo = a.modulo
        ON CONFLICT (user_id, modulo) DO NOTHING;

        UPDATE organizations o SET modulos_habilitados = (
            SELECT array_agg(DISTINCT m ORDER BY m)
            FROM unnest(
                o.modulos_habilitados
                || CASE WHEN 'ventas' = ANY(o.modulos_habilitados) THEN ARRAY['pos'] ELSE '{}'::text[] END
                || CASE WHEN 'articulos' = ANY(o.modulos_habilitados) THEN ARRAY['precios', 'ajustes'] ELSE '{}'::text[] END
                || CASE WHEN 'caja' = ANY(o.modulos_habilitados) THEN ARRAY['cierres'] ELSE '{}'::text[] END
            ) AS m
        )
        WHERE o.modulos_habilitados IS NOT NULL;

        INSERT INTO schema_migraciones (nombre) VALUES ('permisos-modulos-separados');
    END IF;
END $$;

COMMIT;
