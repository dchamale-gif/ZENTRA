\set ON_ERROR_STOP on

DO $$
DECLARE
    r RECORD;
    tenant_table TEXT;
    has_column BOOLEAN;
    rls_enabled BOOLEAN;
    rls_forced BOOLEAN;
    has_policy BOOLEAN;
    checked_count INTEGER := 0;
BEGIN
    FOR r IN (
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND t.table_name NOT IN (
              'organizations', 'users', 'roles', 'user_roles',
              'permissions', 'role_permissions', 'platform_admins',
              'login_attempts', 'password_reset_tokens', 'user_sessions',
              'user_module_access', 'email_verification_tokens', 'contratos',
              'facturas_plataforma', 'organizacion_notas', 'soporte_accesos'
          )
        ORDER BY t.table_name
    ) LOOP
        tenant_table := r.table_name;
        checked_count := checked_count + 1;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = tenant_table
              AND column_name = 'organization_id'
              AND is_nullable = 'NO'
        ) INTO has_column;

        SELECT COALESCE(c.relrowsecurity, false), COALESCE(c.relforcerowsecurity, false)
        INTO rls_enabled, rls_forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = tenant_table;

        SELECT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = tenant_table
              AND policyname = 'tenant_isolation'
              AND cmd = 'ALL'
        ) INTO has_policy;

        IF NOT has_column OR NOT rls_enabled OR NOT rls_forced OR NOT has_policy THEN
            RAISE EXCEPTION
                'Fallo de seguridad: Aislamiento incompleto en tabla "%". organization_id_not_null=%, rls=%, force_rls=%, policy=%',
                tenant_table, has_column, rls_enabled, rls_forced, has_policy;
        END IF;
    END LOOP;

    IF checked_count = 0 THEN
        RAISE EXCEPTION 'Fallo de seguridad: No se encontraron tablas empresariales para verificar.';
    END IF;

    RAISE NOTICE 'Verificación exitosa: % tablas empresariales con RLS forzado y política activa.', checked_count;
END $$;

SELECT 'Aislamiento multiempresa verificado' AS result;
