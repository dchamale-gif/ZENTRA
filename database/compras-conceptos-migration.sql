BEGIN;

CREATE TABLE IF NOT EXISTS compra_items (
    id VARCHAR(80) PRIMARY KEY,
    compra_id VARCHAR(50) NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    medicina_id VARCHAR(50) REFERENCES medicinas(id),
    articulo_id VARCHAR(50) REFERENCES codigos_articulos(id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(12, 2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal DECIMAL(14, 2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT compra_items_concepto_exclusivo CHECK (
        (medicina_id IS NOT NULL AND articulo_id IS NULL) OR
        (medicina_id IS NULL AND articulo_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_compra_items_compra ON compra_items(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_items_medicina ON compra_items(medicina_id);
CREATE INDEX IF NOT EXISTS idx_compra_items_articulo ON compra_items(articulo_id);

ALTER TABLE compras
    ALTER COLUMN total TYPE DECIMAL(14, 2),
    ALTER COLUMN total SET DEFAULT 0;

COMMIT;