-- Migración: pacientes -> clientes
-- Ejecutar una sola vez, con respaldo previo. Es destructiva en su sección final.

BEGIN;

-- 1. Campos nuevos para la gestión de clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion VARCHAR(255);

ALTER TABLE caja ADD COLUMN IF NOT EXISTS cliente_id VARCHAR(50) REFERENCES clientes(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id VARCHAR(50) REFERENCES clientes(id);
ALTER TABLE cuentas_por_cobrar ADD COLUMN IF NOT EXISTS cliente_id VARCHAR(50) REFERENCES clientes(id);

-- 2. Conservar el vínculo histórico paciente -> cliente cuando exista
DO $$
BEGIN
    IF to_regclass('paciente_cliente') IS NOT NULL THEN
        UPDATE ventas v SET cliente_id = pc.cliente_id
        FROM paciente_cliente pc
        WHERE v.cliente_id IS NULL AND v.paciente_id = pc.paciente_id;

        UPDATE caja c SET cliente_id = pc.cliente_id
        FROM paciente_cliente pc
        WHERE c.cliente_id IS NULL AND c.paciente_id = pc.paciente_id;

        UPDATE cuentas_por_cobrar cc SET cliente_id = pc.cliente_id
        FROM paciente_cliente pc
        WHERE cc.cliente_id IS NULL AND cc.paciente_id = pc.paciente_id;
    END IF;
END $$;

-- 3. Permiso de baja de clientes
INSERT INTO permissions (nombre, descripcion, modulo, accion)
VALUES ('clientes_delete', 'Dar de baja clientes', 'clientes', 'delete')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.nombre = 'admin' AND p.nombre IN ('clientes_view', 'clientes_create', 'clientes_edit', 'clientes_delete')
ON CONFLICT DO NOTHING;

-- 4. Retirar columnas y tablas de pacientes (DESTRUCTIVO)
ALTER TABLE ventas DROP COLUMN IF EXISTS paciente_id;
ALTER TABLE caja DROP COLUMN IF EXISTS paciente_id;
ALTER TABLE cuentas_por_cobrar DROP COLUMN IF EXISTS paciente_id;

DROP TABLE IF EXISTS movimientos_paciente CASCADE;
DROP TABLE IF EXISTS pacientes_saldo CASCADE;
DROP TABLE IF EXISTS medicamentos_paciente CASCADE;
DROP TABLE IF EXISTS diagnosticos_paciente CASCADE;
DROP TABLE IF EXISTS documentos_paciente CASCADE;
DROP TABLE IF EXISTS responsables_paciente CASCADE;
DROP TABLE IF EXISTS paciente_cliente CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;

COMMIT;
