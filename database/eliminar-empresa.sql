-- Migración: eliminar una empresa con todos sus datos (empresas de ejemplo o de prueba).
-- Solo la llama el panel de soporte (rol zentra_platform), que no puede borrar en las
-- tablas de las empresas; la función corre con los permisos de su dueño. Por eso ella
-- misma exige que la empresa esté suspendida o dada de baja, el nombre escrito como
-- confirmación y que no tenga facturas de BotEngine pagadas (historial que se conserva).
--
-- No lleva una lista fija de tablas: borra en toda tabla con organization_id o con
-- llave hacia organizations, más las filas que apuntan a sus usuarios. Repite las que
-- fallan por llaves foráneas hasta que todo sale, así el orden se resuelve solo.

CREATE OR REPLACE FUNCTION eliminar_empresa(p_organization_id INTEGER, p_confirmacion TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_nombre TEXT;
    v_estado TEXT;
    v_tabla TEXT;
    v_columna TEXT;
    v_sql TEXT;
    v_pendientes TEXT[] := '{}';
    v_fallidas TEXT[];
    v_error TEXT;
BEGIN
    SELECT nombre, subscription_status INTO v_nombre, v_estado
    FROM organizations WHERE id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Empresa no encontrada';
    END IF;
    IF v_estado NOT IN ('suspended', 'cancelled') THEN
        RAISE EXCEPTION 'Suspende la empresa antes de eliminarla';
    END IF;
    IF lower(btrim(coalesce(p_confirmacion, ''))) <> lower(btrim(v_nombre)) THEN
        RAISE EXCEPTION 'El nombre escrito no coincide con el de la empresa';
    END IF;
    IF to_regclass('public.facturas_plataforma') IS NOT NULL AND EXISTS (
        SELECT 1 FROM facturas_plataforma
        WHERE organization_id = p_organization_id AND estado = 'pagada'
    ) THEN
        RAISE EXCEPTION 'La empresa tiene facturas de BotEngine pagadas; se conserva para no perder ese historial. Déjala dada de baja.';
    END IF;

    -- Si el dueño no fuera superusuario, la RLS solo le deja ver las filas de esta empresa.
    PERFORM set_config('app.current_organization_id', p_organization_id::TEXT, true);

    -- Filas de la empresa: columna organization_id o llave hacia organizations.
    FOR v_tabla, v_columna IN
        SELECT DISTINCT c.relname, a.attname
        FROM pg_class c
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE c.relnamespace = 'public'::regnamespace
          AND c.relkind IN ('r', 'p')
          AND c.relname <> 'organizations'
          AND (a.attname = 'organization_id' OR EXISTS (
                SELECT 1 FROM pg_constraint k
                WHERE k.contype = 'f' AND k.conrelid = c.oid
                  AND k.confrelid = 'public.organizations'::regclass
                  AND k.conkey = ARRAY[a.attnum]))
    LOOP
        v_pendientes := v_pendientes || format('DELETE FROM public.%I WHERE %I = $1', v_tabla, v_columna);
    END LOOP;

    -- Filas sin organization_id que apuntan a sus usuarios y no se borran solas (sin CASCADE ni SET NULL).
    FOR v_tabla, v_columna IN
        SELECT DISTINCT c.relname, a.attname
        FROM pg_constraint k
        JOIN pg_class c ON c.oid = k.conrelid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.conkey[1]
        WHERE k.contype = 'f'
          AND k.confrelid = 'public.users'::regclass
          AND cardinality(k.conkey) = 1
          AND k.confdeltype IN ('a', 'r')
          AND c.relnamespace = 'public'::regnamespace
          AND NOT EXISTS (
                SELECT 1 FROM pg_attribute o
                WHERE o.attrelid = c.oid AND o.attname = 'organization_id' AND NOT o.attisdropped)
    LOOP
        v_pendientes := v_pendientes || format(
            'DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.users WHERE organization_id = $1)',
            v_tabla, v_columna);
    END LOOP;

    -- Cada vuelta borra lo que ya no tiene filas que dependan de ello.
    LOOP
        v_fallidas := '{}';
        FOREACH v_sql IN ARRAY v_pendientes LOOP
            BEGIN
                EXECUTE v_sql USING p_organization_id;
            EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
                v_fallidas := v_fallidas || v_sql;
                v_error := SQLERRM;
            END;
        END LOOP;
        EXIT WHEN cardinality(v_fallidas) = 0;
        IF cardinality(v_fallidas) = cardinality(v_pendientes) THEN
            RAISE EXCEPTION 'No se pudo eliminar la empresa: %', v_error;
        END IF;
        v_pendientes := v_fallidas;
    END LOOP;

    DELETE FROM organizations WHERE id = p_organization_id;
    RETURN v_nombre;
END;
$$;

REVOKE ALL ON FUNCTION eliminar_empresa(INTEGER, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_platform') THEN
        GRANT EXECUTE ON FUNCTION eliminar_empresa(INTEGER, TEXT) TO zentra_platform;
    END IF;
END $$;
