-- ============================================
-- MIGRACIÓN IDEMPOTENTE: ESTADO DE CUENTA Y SALDO
-- Fecha: 2026-07-01
-- Descripción: Setup seguro para Estado de Cuenta (create si no existe, update si existe)
-- Ejecutar una sola vez en base de datos de producción
-- ============================================

BEGIN;

-- ============================================
-- 1. MODIFICAR TABLA venta_items - Agregar campo tipo_item
-- ============================================

-- Verificar y agregar columna tipo_item si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'venta_items' AND column_name = 'tipo_item'
    ) THEN
        ALTER TABLE venta_items ADD COLUMN tipo_item VARCHAR(50) DEFAULT 'general';
        RAISE NOTICE 'Columna tipo_item agregada a venta_items';
    ELSE
        RAISE NOTICE 'Columna tipo_item ya existe en venta_items';
    END IF;
END $$;

-- ============================================
-- 2. MODIFICAR TABLA ventas - Agregar campos para facturación mejorada
-- ============================================

-- Agregar campo total_descuentos si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ventas' AND column_name = 'total_descuentos'
    ) THEN
        ALTER TABLE ventas ADD COLUMN total_descuentos DECIMAL(12, 2) DEFAULT 0;
        RAISE NOTICE 'Columna total_descuentos agregada a ventas';
    ELSE
        RAISE NOTICE 'Columna total_descuentos ya existe en ventas';
    END IF;
END $$;

-- Agregar campo base_impuesto si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ventas' AND column_name = 'base_impuesto'
    ) THEN
        ALTER TABLE ventas ADD COLUMN base_impuesto DECIMAL(12, 2) DEFAULT 0;
        RAISE NOTICE 'Columna base_impuesto agregada a ventas';
    ELSE
        RAISE NOTICE 'Columna base_impuesto ya existe en ventas';
    END IF;
END $$;

-- Agregar campo total_impuestos si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ventas' AND column_name = 'total_impuestos'
    ) THEN
        ALTER TABLE ventas ADD COLUMN total_impuestos DECIMAL(12, 2) DEFAULT 0;
        RAISE NOTICE 'Columna total_impuestos agregada a ventas';
    ELSE
        RAISE NOTICE 'Columna total_impuestos ya existe en ventas';
    END IF;
END $$;

-- Agregar campo tipo_factura si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ventas' AND column_name = 'tipo_factura'
    ) THEN
        ALTER TABLE ventas ADD COLUMN tipo_factura VARCHAR(50) DEFAULT 'normal';
        RAISE NOTICE 'Columna tipo_factura agregada a ventas';
    ELSE
        RAISE NOTICE 'Columna tipo_factura ya existe en ventas';
    END IF;
END $$;

-- Actualizar campos existentes si están en 0 o NULL
UPDATE ventas SET total_descuentos = descuento WHERE total_descuentos = 0 OR total_descuentos IS NULL;
UPDATE ventas SET base_impuesto = (subtotal - descuento) WHERE base_impuesto = 0 OR base_impuesto IS NULL;
UPDATE ventas SET total_impuestos = impuesto WHERE total_impuestos = 0 OR total_impuestos IS NULL;
UPDATE ventas SET tipo_factura = 'normal' WHERE tipo_factura IS NULL OR tipo_factura = '';

-- ============================================
-- 3. CREAR TABLA pacientes_saldo (si no existe)
-- ============================================

CREATE TABLE IF NOT EXISTS pacientes_saldo (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,
    saldo_pendiente DECIMAL(15, 2) DEFAULT 0.00,
    total_deuda DECIMAL(15, 2) DEFAULT 0.00,
    ultima_transaccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_actualizo VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$
DECLARE
    default_organization_id INTEGER;
BEGIN
    IF to_regclass('organizations') IS NOT NULL THEN
        SELECT id INTO default_organization_id FROM organizations ORDER BY id LIMIT 1;
        ALTER TABLE pacientes_saldo ADD COLUMN IF NOT EXISTS organization_id INTEGER;
        UPDATE pacientes_saldo ps
        SET organization_id = COALESCE(p.organization_id, default_organization_id)
        FROM pacientes p
        WHERE p.id::TEXT = ps.paciente_id::TEXT AND ps.organization_id IS NULL;
        UPDATE pacientes_saldo SET organization_id = default_organization_id
        WHERE organization_id IS NULL;
        ALTER TABLE pacientes_saldo
            ALTER COLUMN organization_id SET DEFAULT app_current_organization_id(),
            ALTER COLUMN organization_id SET NOT NULL;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'pacientes_saldo_organization_id_fkey'
              AND conrelid = 'pacientes_saldo'::regclass
        ) THEN
            ALTER TABLE pacientes_saldo
                ADD CONSTRAINT pacientes_saldo_organization_id_fkey
                FOREIGN KEY (organization_id) REFERENCES organizations(id);
        END IF;
        CREATE INDEX IF NOT EXISTS idx_pacientes_saldo_organization_id
            ON pacientes_saldo(organization_id);
        ALTER TABLE pacientes_saldo ENABLE ROW LEVEL SECURITY;
        ALTER TABLE pacientes_saldo FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON pacientes_saldo;
        CREATE POLICY tenant_isolation ON pacientes_saldo
            FOR ALL USING (organization_id = app_current_organization_id())
            WITH CHECK (organization_id = app_current_organization_id());
    END IF;
END $$;

-- ============================================
-- 4. CREAR TABLA movimientos_paciente (si no existe)
-- ============================================

CREATE TABLE IF NOT EXISTS movimientos_paciente (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,
    descripcion TEXT,
    monto DECIMAL(15, 2) NOT NULL,
    saldo_anterior DECIMAL(15, 2),
    saldo_nuevo DECIMAL(15, 2),
    referencia_id VARCHAR(50),
    usuario_id INTEGER,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$
DECLARE
    default_organization_id INTEGER;
BEGIN
    IF to_regclass('organizations') IS NOT NULL THEN
        SELECT id INTO default_organization_id FROM organizations ORDER BY id LIMIT 1;
        ALTER TABLE movimientos_paciente ADD COLUMN IF NOT EXISTS organization_id INTEGER;
        UPDATE movimientos_paciente mp
        SET organization_id = COALESCE(p.organization_id, default_organization_id)
        FROM pacientes p
        WHERE p.id::TEXT = mp.paciente_id::TEXT AND mp.organization_id IS NULL;
        UPDATE movimientos_paciente SET organization_id = default_organization_id
        WHERE organization_id IS NULL;
        ALTER TABLE movimientos_paciente
            ALTER COLUMN organization_id SET DEFAULT app_current_organization_id(),
            ALTER COLUMN organization_id SET NOT NULL;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'movimientos_paciente_organization_id_fkey'
              AND conrelid = 'movimientos_paciente'::regclass
        ) THEN
            ALTER TABLE movimientos_paciente
                ADD CONSTRAINT movimientos_paciente_organization_id_fkey
                FOREIGN KEY (organization_id) REFERENCES organizations(id);
        END IF;
        CREATE INDEX IF NOT EXISTS idx_movimientos_paciente_organization_id
            ON movimientos_paciente(organization_id);
        ALTER TABLE movimientos_paciente ENABLE ROW LEVEL SECURITY;
        ALTER TABLE movimientos_paciente FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON movimientos_paciente;
        CREATE POLICY tenant_isolation ON movimientos_paciente
            FOR ALL USING (organization_id = app_current_organization_id())
            WITH CHECK (organization_id = app_current_organization_id());
    END IF;
END $$;

-- ============================================
-- 5. CREAR ÍNDICES para mejor performance (si no existen)
-- ============================================

-- Índices para pacientes_saldo
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pacientes_saldo_paciente_id') THEN
        CREATE INDEX idx_pacientes_saldo_paciente_id ON pacientes_saldo(paciente_id);
        RAISE NOTICE 'Índice idx_pacientes_saldo_paciente_id creado';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pacientes_saldo_saldo_pendiente') THEN
        CREATE INDEX idx_pacientes_saldo_saldo_pendiente ON pacientes_saldo(saldo_pendiente);
        RAISE NOTICE 'Índice idx_pacientes_saldo_saldo_pendiente creado';
    END IF;
END $$;

-- Índices para movimientos_paciente
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_movimientos_paciente_id') THEN
        CREATE INDEX idx_movimientos_paciente_id ON movimientos_paciente(paciente_id);
        RAISE NOTICE 'Índice idx_movimientos_paciente_id creado';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_movimientos_tipo') THEN
        CREATE INDEX idx_movimientos_tipo ON movimientos_paciente(tipo);
        RAISE NOTICE 'Índice idx_movimientos_tipo creado';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_movimientos_fecha') THEN
        CREATE INDEX idx_movimientos_fecha ON movimientos_paciente(fecha);
        RAISE NOTICE 'Índice idx_movimientos_fecha creado';
    END IF;
END $$;

-- Índices para venta_items y ventas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_venta_items_tipo_item') THEN
        CREATE INDEX idx_venta_items_tipo_item ON venta_items(tipo_item);
        RAISE NOTICE 'Índice idx_venta_items_tipo_item creado';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_venta_items_venta_id') THEN
        CREATE INDEX idx_venta_items_venta_id ON venta_items(venta_id);
        RAISE NOTICE 'Índice idx_venta_items_venta_id creado';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ventas_paciente_id') THEN
        CREATE INDEX idx_ventas_paciente_id ON ventas(paciente_id);
        RAISE NOTICE 'Índice idx_ventas_paciente_id creado';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ventas_fecha') THEN
        CREATE INDEX idx_ventas_fecha ON ventas(fecha);
        RAISE NOTICE 'Índice idx_ventas_fecha creado';
    END IF;
END $$;

-- ============================================
-- 6. INICIALIZAR pacientes_saldo para pacientes existentes
-- ============================================

-- Insertar registros de saldo solo para pacientes sin saldo registrado
INSERT INTO pacientes_saldo (
    paciente_id, 
    saldo_pendiente, 
    total_deuda, 
    usuario_actualizo
)
SELECT 
    p.id,
    0.00,
    0.00,
    'SYSTEM'
FROM pacientes p
WHERE p.id NOT IN (
    SELECT paciente_id FROM pacientes_saldo WHERE paciente_id IS NOT NULL
)
ON CONFLICT (paciente_id) DO NOTHING;

-- ============================================
-- 7. VERIFICACIÓN FINAL Y REPORTE
-- ============================================

DO $$
DECLARE
    v_venta_items_count INT;
    v_pacientes_saldo_count INT;
    v_movimientos_count INT;
BEGIN
    SELECT COUNT(*) INTO v_venta_items_count FROM venta_items;
    SELECT COUNT(*) INTO v_pacientes_saldo_count FROM pacientes_saldo;
    SELECT COUNT(*) INTO v_movimientos_count FROM movimientos_paciente;
    
    RAISE NOTICE '====================================';
    RAISE NOTICE 'VERIFICACIÓN DE MIGRACIÓN';
    RAISE NOTICE '====================================';
    RAISE NOTICE 'venta_items: % registros', v_venta_items_count;
    RAISE NOTICE 'pacientes_saldo: % registros', v_pacientes_saldo_count;
    RAISE NOTICE 'movimientos_paciente: % registros', v_movimientos_count;
    RAISE NOTICE '====================================';
    RAISE NOTICE '✅ Migración completada exitosamente';
    RAISE NOTICE '====================================';
END $$;

COMMIT;

-- ============================================
-- FIN DE MIGRACIÓN IDEMPOTENTE
-- ============================================
-- Status: ✅ Listo para ejecutar
-- Notas: 
--   - Script es seguro para ejecutar múltiples veces
--   - Verifica existencia antes de crear
--   - Actualiza datos si es necesario
--   - No elimina datos existentes
-- ============================================
