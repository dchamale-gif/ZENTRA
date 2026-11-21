-- Migración: pedidos de la página web registrados como ventas del ERP.
-- origen = 'web' y referencia_externa = número de pedido de la web. El índice único impide que un
-- reintento de la web registre dos veces el mismo pedido.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS origen VARCHAR(20);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS referencia_externa VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_referencia_externa
    ON ventas (organization_id, origen, referencia_externa)
    WHERE referencia_externa IS NOT NULL;

COMMIT;
