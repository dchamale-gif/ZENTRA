-- Migración: descuentos al vender.
--   · venta_items.descuento: descuento de la línea, como lo escribió el vendedor (en Q).
--   · venta_items.descuento_general: la parte del descuento al total que le toca a la línea
--     (se reparte para que la factura electrónica, que solo admite descuento por línea, y los
--     reportes por producto cuadren con el total de la venta).
--   · ventas.descuento_general: el descuento al total como se escribió; ventas.descuento ya
--     existía y pasa a ser la suma de todos los descuentos (subtotal - descuento = total).
--   · pos_cuenta_items.descuento: descuento de la línea en una cuenta abierta del punto de venta.
-- Descuentos es un módulo con permiso propio. Las empresas con lista de módulos que venden
-- (Ventas o Punto de venta) lo reciben una sola vez; ningún usuario lo recibe: lo da el
-- administrador, que lo tiene siempre.
-- Se puede repetir sin efecto.

BEGIN;

ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS descuento DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS descuento_general DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_general DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE pos_cuenta_items ADD COLUMN IF NOT EXISTS descuento DECIMAL(10, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_items_descuentos_check') THEN
        ALTER TABLE venta_items ADD CONSTRAINT venta_items_descuentos_check
            CHECK (descuento >= 0 AND descuento_general >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_cuenta_items_descuento_check') THEN
        ALTER TABLE pos_cuenta_items ADD CONSTRAINT pos_cuenta_items_descuento_check
            CHECK (descuento >= 0 AND descuento <= cantidad * precio_unitario);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS schema_migraciones (
    nombre VARCHAR(100) PRIMARY KEY,
    aplicada_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migraciones WHERE nombre = 'modulo-descuentos') THEN
        UPDATE organizations o SET modulos_habilitados = (
            SELECT array_agg(DISTINCT m ORDER BY m)
            FROM unnest(o.modulos_habilitados || ARRAY['descuentos']) AS m
        )
        WHERE o.modulos_habilitados IS NOT NULL
          AND o.modulos_habilitados && ARRAY['ventas', 'pos'];

        INSERT INTO schema_migraciones (nombre) VALUES ('modulo-descuentos');
    END IF;
END $$;

COMMIT;
