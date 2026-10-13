#!/bin/sh
set -eu

read_secret() {
  cat "$1"
}

tenant_password="$(read_secret "$ZENTRA_TENANT_PASSWORD_FILE")"
auth_password="$(read_secret "$ZENTRA_AUTH_PASSWORD_FILE")"
platform_password="$(read_secret "$ZENTRA_PLATFORM_PASSWORD_FILE")"

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=tenant_password="$tenant_password" \
  --set=auth_password="$auth_password" \
  --set=platform_password="$platform_password" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zentra_tenant') THEN
        CREATE ROLE zentra_tenant;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zentra_auth') THEN
        CREATE ROLE zentra_auth;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zentra_platform') THEN
        CREATE ROLE zentra_platform;
    END IF;
END $$;

ALTER ROLE zentra_tenant WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'tenant_password';
ALTER ROLE zentra_auth WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'auth_password';
ALTER ROLE zentra_platform WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'platform_password';

GRANT CONNECT ON DATABASE zentra TO zentra_tenant, zentra_auth, zentra_platform;
GRANT USAGE ON SCHEMA public TO zentra_tenant, zentra_auth, zentra_platform;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zentra_tenant;
REVOKE INSERT, UPDATE, DELETE ON organizations, users, user_roles, roles,
    permissions, role_permissions, platform_admins, login_attempts,
    password_reset_tokens, user_sessions FROM zentra_tenant;

GRANT SELECT ON organizations, users, user_roles, roles, permissions,
    role_permissions TO zentra_auth;
GRANT INSERT, UPDATE ON organizations, users, user_roles TO zentra_auth;

GRANT SELECT, INSERT, UPDATE ON organizations, platform_admins TO zentra_platform;
GRANT SELECT ON users TO zentra_platform;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
    TO zentra_tenant, zentra_auth, zentra_platform;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zentra_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO zentra_tenant, zentra_auth, zentra_platform;
SQL
