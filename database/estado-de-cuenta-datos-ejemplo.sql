-- ============================================
-- DATOS DE EJEMPLO PARA ESTADO DE CUENTA - v2 (ROBUSTA)
-- Fecha: 2026-07-01
-- Descripción: Inserta pacientes de ejemplo con saldos y movimientos
-- VENTAJA: Cada operación se ejecuta en su propia transacción independiente
-- ============================================

\set ON_ERROR_STOP off

-- ============================================
-- 1. INSERTAR PACIENTES DE EJEMPLO
-- ============================================
BEGIN;
INSERT INTO pacientes (
    id, nombre, apellido_paterno, apellido_materno, edad, fecha_nacimiento,
    genero, dpi, telefono, email, direccion, colonia, zona, municipio, 
    departamento, estado_civil, profesion, ocupacion, estado, created_at, updated_at
) VALUES 
(
    1001, 'Juan', 'López', 'Rodríguez', 45, '1981-03-15',
    'M', '1234567890101', '7856-1234', 'juan.lopez@email.com', 
    'Calle Principal 123', 'Zona 10', '10', 'Guatemala', 'Guatemala',
    'Casado', 'Ingeniero', 'Empleado Público', 'activo', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO pacientes (
    id, nombre, apellido_paterno, apellido_materno, edad, fecha_nacimiento,
    genero, dpi, telefono, email, direccion, colonia, zona, municipio, 
    departamento, estado_civil, profesion, ocupacion, estado, created_at, updated_at
) VALUES 
(
    1002, 'María', 'García', 'Morales', 38, '1988-07-22',
    'F', '2345678901012', '7865-5678', 'maria.garcia@email.com',
    'Avenida Central 456', 'Zona 12', '12', 'Guatemala', 'Guatemala',
    'Soltera', 'Médica', 'Autónoma', 'activo', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO pacientes (
    id, nombre, apellido_paterno, apellido_materno, edad, fecha_nacimiento,
    genero, dpi, telefono, email, direccion, colonia, zona, municipio, 
    departamento, estado_civil, profesion, ocupacion, estado, created_at, updated_at
) VALUES 
(
    1003, 'Carlos', 'Pérez', 'López', 52, '1974-11-08',
    'M', '3456789012123', '7834-9012', 'carlos.perez@email.com',
    'Boulevard los Próceres 789', 'Zona 15', '15', 'Guatemala', 'Guatemala',
    'Divorciado', 'Abogado', 'Profesional Independiente', 'activo', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO pacientes (
    id, nombre, apellido_paterno, apellido_materno, edad, fecha_nacimiento,
    genero, dpi, telefono, email, direccion, colonia, zona, municipio, 
    departamento, estado_civil, profesion, ocupacion, estado, created_at, updated_at
) VALUES 
(
    1004, 'Ana', 'Martínez', 'Díaz', 29, '1997-05-10',
    'F', '4567890123234', '7812-3456', 'ana.martinez@email.com',
    'Paseo Montufar 321', 'Zona 3', '3', 'Guatemala', 'Guatemala',
    'Casada', 'Psicóloga', 'Clínica Privada', 'activo', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO pacientes (
    id, nombre, apellido_paterno, apellido_materno, edad, fecha_nacimiento,
    genero, dpi, telefono, email, direccion, colonia, zona, municipio, 
    departamento, estado_civil, profesion, ocupacion, estado, created_at, updated_at
) VALUES 
(
    1005, 'Roberto', 'Sánchez', 'Gómez', 61, '1965-12-25',
    'M', '5678901234345', '7843-7890', 'robert.sanchez@email.com',
    'Carrera 8 654', 'Zona 9', '9', 'Guatemala', 'Guatemala',
    'Viudo', 'Contador', 'Jubilado', 'activo', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;
COMMIT;

-- ============================================
-- 2. INSERTAR SALDOS DE PACIENTES
-- ============================================

BEGIN;
INSERT INTO pacientes_saldo (paciente_id, saldo_pendiente, total_deuda, usuario_actualizo, created_at, updated_at)
VALUES (1001, 1250.00, 3500.00, 'SYSTEM', NOW(), NOW())
ON CONFLICT (paciente_id) DO UPDATE SET saldo_pendiente = EXCLUDED.saldo_pendiente, total_deuda = EXCLUDED.total_deuda, updated_at = NOW();
COMMIT;

BEGIN;
INSERT INTO pacientes_saldo (paciente_id, saldo_pendiente, total_deuda, usuario_actualizo, created_at, updated_at)
VALUES (1002, 0.00, 850.00, 'SYSTEM', NOW(), NOW())
ON CONFLICT (paciente_id) DO UPDATE SET saldo_pendiente = EXCLUDED.saldo_pendiente, total_deuda = EXCLUDED.total_deuda, updated_at = NOW();
COMMIT;

BEGIN;
INSERT INTO pacientes_saldo (paciente_id, saldo_pendiente, total_deuda, usuario_actualizo, created_at, updated_at)
VALUES (1003, 3750.50, 5200.50, 'SYSTEM', NOW(), NOW())
ON CONFLICT (paciente_id) DO UPDATE SET saldo_pendiente = EXCLUDED.saldo_pendiente, total_deuda = EXCLUDED.total_deuda, updated_at = NOW();
COMMIT;

BEGIN;
INSERT INTO pacientes_saldo (paciente_id, saldo_pendiente, total_deuda, usuario_actualizo, created_at, updated_at)
VALUES (1004, 450.75, 1200.75, 'SYSTEM', NOW(), NOW())
ON CONFLICT (paciente_id) DO UPDATE SET saldo_pendiente = EXCLUDED.saldo_pendiente, total_deuda = EXCLUDED.total_deuda, updated_at = NOW();
COMMIT;

BEGIN;
INSERT INTO pacientes_saldo (paciente_id, saldo_pendiente, total_deuda, usuario_actualizo, created_at, updated_at)
VALUES (1005, 0.00, 2100.00, 'SYSTEM', NOW(), NOW())
ON CONFLICT (paciente_id) DO UPDATE SET saldo_pendiente = EXCLUDED.saldo_pendiente, total_deuda = EXCLUDED.total_deuda, updated_at = NOW();
COMMIT;

-- ============================================
-- 3. INSERTAR MOVIMIENTOS DE PACIENTES
-- ============================================

BEGIN;
INSERT INTO movimientos_paciente (paciente_id, tipo, descripcion, monto, saldo_anterior, saldo_nuevo, referencia_id, fecha, created_at)
VALUES (1001, 'cargo', 'Consulta Psiquiátrica', 500.00, 750.00, 1250.00, 'FAC_001', '2026-06-28', NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO movimientos_paciente (paciente_id, tipo, descripcion, monto, saldo_anterior, saldo_nuevo, referencia_id, fecha, created_at)
VALUES (1001, 'abono', 'Pago parcial', -500.00, 1250.00, 750.00, 'PAG_001', '2026-06-27', NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO movimientos_paciente (paciente_id, tipo, descripcion, monto, saldo_anterior, saldo_nuevo, referencia_id, fecha, created_at)
VALUES (1003, 'cargo', 'Internamiento (3 días)', 2000.00, 1750.50, 3750.50, 'FAC_002', '2026-06-29', NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO movimientos_paciente (paciente_id, tipo, descripcion, monto, saldo_anterior, saldo_nuevo, referencia_id, fecha, created_at)
VALUES (1003, 'abono', 'Abono a cuenta', -1000.00, 3750.50, 2750.50, 'PAG_002', '2026-06-24', NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO movimientos_paciente (paciente_id, tipo, descripcion, monto, saldo_anterior, saldo_nuevo, referencia_id, fecha, created_at)
VALUES (1002, 'cargo', 'Medicamentos', 350.00, 500.00, 850.00, 'FAC_003', '2026-06-23', NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO movimientos_paciente (paciente_id, tipo, descripcion, monto, saldo_anterior, saldo_nuevo, referencia_id, fecha, created_at)
VALUES (1002, 'abono', 'Pago completo', -850.00, 850.00, 0.00, 'PAG_003', '2026-06-25', NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO movimientos_paciente (paciente_id, tipo, descripcion, monto, saldo_anterior, saldo_nuevo, referencia_id, fecha, created_at)
VALUES (1004, 'cargo', 'Consulta + Laboratorio', 450.75, 0.00, 450.75, 'FAC_004', '2026-06-26', NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO movimientos_paciente (paciente_id, tipo, descripcion, monto, saldo_anterior, saldo_nuevo, referencia_id, fecha, created_at)
VALUES (1005, 'abono', 'Pago total', -2100.00, 2100.00, 0.00, 'PAG_004', '2026-06-20', NOW())
ON CONFLICT DO NOTHING;
COMMIT;

-- ============================================
-- 4. INSERTAR FACTURAS DE EJEMPLO
-- ============================================

BEGIN;
INSERT INTO ventas (paciente_id, subtotal, descuento, impuesto, total, total_descuentos, base_impuesto, total_impuestos, tipo_factura, estado, created_at, updated_at)
VALUES (1001, 500.00, 0.00, 50.00, 550.00, 0.00, 500.00, 50.00, 'normal', 'completada', NOW(), NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO ventas (paciente_id, subtotal, descuento, impuesto, total, total_descuentos, base_impuesto, total_impuestos, tipo_factura, estado, created_at, updated_at)
VALUES (1003, 2000.00, 100.00, 190.00, 2090.00, 100.00, 1900.00, 190.00, 'normal', 'completada', NOW(), NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO ventas (paciente_id, subtotal, descuento, impuesto, total, total_descuentos, base_impuesto, total_impuestos, tipo_factura, estado, created_at, updated_at)
VALUES (1002, 350.00, 0.00, 35.00, 385.00, 0.00, 350.00, 35.00, 'normal', 'completada', NOW(), NOW())
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
INSERT INTO ventas (paciente_id, subtotal, descuento, impuesto, total, total_descuentos, base_impuesto, total_impuestos, tipo_factura, estado, created_at, updated_at)
VALUES (1004, 450.75, 0.00, 45.08, 495.83, 0.00, 450.75, 45.08, 'normal', 'completada', NOW(), NOW())
ON CONFLICT DO NOTHING;
COMMIT;

-- ============================================
-- 5. VERIFICACIÓN - RESUMEN DE DATOS INSERTADOS
-- ============================================

\set ON_ERROR_STOP on

SELECT E'\n====================================';
SELECT 'DATOS DE EJEMPLO INSERTADOS - RESUMEN' as status;
SELECT '====================================' as status;

SELECT COUNT(*) as "Pacientes (1001-1005)" FROM pacientes WHERE id BETWEEN 1001 AND 1005;
SELECT COUNT(*) as "Saldos de Pacientes" FROM pacientes_saldo WHERE paciente_id BETWEEN 1001 AND 1005;
SELECT COUNT(*) as "Movimientos Registrados" FROM movimientos_paciente WHERE paciente_id BETWEEN 1001 AND 1005;
SELECT COUNT(*) as "Facturas de Ejemplo" FROM ventas WHERE paciente_id BETWEEN 1001 AND 1005;

SELECT E'\n✅ Datos cargados exitosamente' as resultado;
SELECT 'Ahora puedes ver estos datos en:' as info;
SELECT '  • Saldo del Paciente (filtros de pacientes)' as info;
SELECT '  • Estado de Cuenta (facturación mejorada)' as info;
SELECT '====================================' as status;
