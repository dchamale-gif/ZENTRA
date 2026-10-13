BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    slug VARCHAR(80) UNIQUE NOT NULL,
    nit VARCHAR(30),
    sector_comercial VARCHAR(150),
    email VARCHAR(150),
    telefono VARCHAR(30),
    direccion VARCHAR(255),
    license_key VARCHAR(14) UNIQUE,
    license_plan VARCHAR(50),
    license_issued_at TIMESTAMPTZ,
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'trial'
        CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
    trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    subscription_started_at TIMESTAMPTZ,
    subscription_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sector_comercial VARCHAR(150);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS direccion VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_key VARCHAR(14);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_plan VARCHAR(50);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_issued_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_license_key
    ON organizations(license_key)
    WHERE license_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform_admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    ultimo_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION app_current_organization_id()
RETURNS INTEGER
LANGUAGE SQL
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_organization_id', true), '')::INTEGER
$$;

INSERT INTO organizations (
    nombre,
    slug,
    subscription_status,
    trial_started_at,
    trial_ends_at,
    subscription_started_at
)
SELECT
    'Organización principal',
    'organizacion-principal',
    'active',
    NOW(),
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM organizations);

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INTEGER;
UPDATE users
SET organization_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
WHERE organization_id IS NULL;
ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_organization_id_fkey'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_organization_id_fkey
            FOREIGN KEY (organization_id) REFERENCES organizations(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

INSERT INTO permissions (nombre, descripcion, modulo, accion) VALUES
('inventario_view', 'Ver inventario', 'inventario', 'view'),
('inventario_create', 'Crear artículos', 'inventario', 'create'),
('inventario_edit', 'Editar inventario', 'inventario', 'edit'),
('inventario_delete', 'Eliminar artículos', 'inventario', 'delete'),
('proveedores_view', 'Ver proveedores', 'proveedores', 'view'),
('proveedores_create', 'Crear proveedores', 'proveedores', 'create'),
('proveedores_edit', 'Editar proveedores', 'proveedores', 'edit'),
('proveedores_delete', 'Eliminar proveedores', 'proveedores', 'delete'),
('compras_delete', 'Eliminar compras', 'compras', 'delete'),
('ventas_edit', 'Editar ventas', 'ventas', 'edit'),
('ventas_delete', 'Eliminar ventas', 'ventas', 'delete'),
('cobros_view', 'Ver cuentas por cobrar', 'cobros', 'view'),
('cobros_create', 'Registrar cobros', 'cobros', 'create')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.nombre = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.nombre = 'gerente_compras'
  AND p.nombre IN (
    'inventario_view', 'inventario_create', 'inventario_edit', 'inventario_delete',
    'proveedores_view', 'proveedores_create', 'proveedores_edit', 'proveedores_delete',
    'compras_view', 'compras_create', 'compras_edit', 'compras_delete'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.nombre = 'contador'
  AND p.nombre IN ('cobros_view', 'cobros_create')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    tenant_table TEXT;
    tenant_tables TEXT[] := ARRAY[
        'pacientes',
        'empresas',
        'contactos_emergencia',
        'historial_medico',
        'laboratorios',
        'ordenes',
        'alertas',
        'datos_familia',
        'responsables_paciente',
        'documentos_paciente',
        'clientes',
        'paciente_cliente',
        'historia_clinica',
        'diagnosticos_paciente',
        'habitaciones',
        'camas',
        'hospitalizaciones',
        'traslados_camas',
        'medicinas',
        'medicamentos_paciente',
        'proveedores',
        'codigos_articulos',
        'compras',
        'compra_items',
        'ventas',
        'venta_items',
        'servicios',
        'servicios_facturados',
        'caja',
        'estados_cuenta',
        'cuentas_por_cobrar',
        'pagos_cuentas',
        'pagos_factura',
        'pacientes_saldo',
        'movimientos_paciente',
        'audit_log',
        'reservas',
        'agenda',
        'configuracion',
        'personal_medico'
    ];
    legacy_organization_id INTEGER;
BEGIN
    SELECT id INTO legacy_organization_id
    FROM organizations
    ORDER BY id
    LIMIT 1;

    FOREACH tenant_table IN ARRAY tenant_tables LOOP
        IF to_regclass(tenant_table) IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN IF NOT EXISTS organization_id INTEGER',
                tenant_table
            );
            EXECUTE format(
                'UPDATE %I SET organization_id = $1 WHERE organization_id IS NULL',
                tenant_table
            ) USING legacy_organization_id;
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN organization_id SET DEFAULT app_current_organization_id()',
                tenant_table
            );
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN organization_id SET NOT NULL',
                tenant_table
            );

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = tenant_table || '_organization_id_fkey'
                  AND conrelid = to_regclass(tenant_table)
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES organizations(id)',
                    tenant_table,
                    tenant_table || '_organization_id_fkey'
                );
            END IF;

            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I (organization_id)',
                'idx_' || tenant_table || '_organization_id',
                tenant_table
            );
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
            EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tenant_table);
            EXECUTE format(
                'CREATE POLICY tenant_isolation ON %I FOR ALL USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())',
                tenant_table
            );
        END IF;
    END LOOP;
END $$;

ALTER TABLE codigos_articulos DROP CONSTRAINT IF EXISTS codigos_articulos_codigo_key;
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_numero_compra_key;
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_numero_venta_key;
ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_dpi_key;
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_email_key;
ALTER TABLE configuracion DROP CONSTRAINT IF EXISTS configuracion_clave_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_codigos_articulos_org_codigo
    ON codigos_articulos(organization_id, codigo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_org_numero
    ON compras(organization_id, numero_compra);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_org_numero
    ON ventas(organization_id, numero_venta);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pacientes_org_dpi
    ON pacientes(organization_id, dpi)
    WHERE dpi IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_org_email
    ON clientes(organization_id, email)
    WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_configuracion_org_clave
    ON configuracion(organization_id, clave);

COMMIT;
