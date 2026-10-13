-- ============================================
-- MIGRATION: Agregar campos faltantes a codigos_articulos
-- Fecha: 2026-07-22
-- ============================================

-- Verificar si la tabla existe
ALTER TABLE codigos_articulos
ADD COLUMN IF NOT EXISTS subfamilia VARCHAR(100),
ADD COLUMN IF NOT EXISTS precio_costo DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(50),
ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(100),
ADD COLUMN IF NOT EXISTS codigo_alternativo VARCHAR(100),
ADD COLUMN IF NOT EXISTS descripcion2 TEXT,
ADD COLUMN IF NOT EXISTS tipo VARCHAR(50);

-- Crear índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_codigos_articulos_codigo_barras 
ON codigos_articulos(codigo_barras);

CREATE INDEX IF NOT EXISTS idx_codigos_articulos_familia_subfamilia 
ON codigos_articulos(familia, subfamilia);

-- Verificar la estructura actual
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'codigos_articulos' 
ORDER BY ordinal_position;
