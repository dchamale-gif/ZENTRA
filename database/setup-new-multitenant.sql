-- ============================================================
-- ZENTRA - INSTALACIÓN LIMPIA MULTIEMPRESA
-- ============================================================
-- Ejecutar desde psql conectado a una base de datos nueva:
--
--   createdb zentra
--   psql -v ON_ERROR_STOP=1 -d zentra \
--     -f database/setup-new-multitenant.sql
--
-- El archivo crea el esquema base y después habilita:
--   - organizaciones y usuarios administradores
--   - aislamiento por empresa con PostgreSQL RLS
--   - prueba inicial de 30 días
-- ============================================================

\set ON_ERROR_STOP on

\ir schema.sql
\ir multitenancy-trial-migration.sql

-- Verificación rápida de la instalación.
SELECT
    (SELECT COUNT(*) FROM organizations) AS organizations,
    (SELECT COUNT(*) FROM pg_policies WHERE policyname = 'tenant_isolation') AS tenant_policies,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE column_name = 'organization_id'
       AND table_schema = current_schema()) AS tenant_columns;
