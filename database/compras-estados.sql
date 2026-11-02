-- Migración: estados de compra con acciones (pedir, recibir, cancelar, reabrir).
-- Por pedir (pendiente) → Pedida (ordenada) → Recibida (suma al inventario); o Cancelada.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

-- Día en que llegó la mercadería (puede ser distinto de la fecha de la compra).
ALTER TABLE compras ADD COLUMN IF NOT EXISTS recibida_en DATE;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT;

-- Compras recibidas antes de esta migración: se toma la fecha de la compra.
UPDATE compras SET recibida_en = COALESCE(fecha_entrega, fecha)
WHERE estado = 'recibida' AND recibida_en IS NULL;

COMMIT;
