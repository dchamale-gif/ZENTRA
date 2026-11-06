-- Migración: el cliente pide factura al cobrar.
-- Se guardan en la venta el NIT/CUI y el nombre que dio. Si la facturación electrónica no está
-- activa, la venta queda como «factura pendiente» hasta que se registre el número de la factura
-- emitida por fuera (portal de SAT o del certificador), o se emita desde el ERP cuando haya FEL.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS factura_solicitada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS factura_receptor_id VARCHAR(20);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS factura_receptor_tipo VARCHAR(10);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS factura_receptor_nombre VARCHAR(400);
-- Serie y número de la factura emitida fuera del ERP.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS factura_externa VARCHAR(120);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS factura_externa_at TIMESTAMPTZ;

COMMIT;
