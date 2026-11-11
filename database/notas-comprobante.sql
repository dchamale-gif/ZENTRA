-- Migración: notas del comprobante.
-- El punto de venta guardaba el nombre de la cuenta en las observaciones de la venta
-- («Punto de venta · Cuenta 3»). Ahora las observaciones son las notas que se imprimen en el
-- comprobante y en la factura (garantías, condiciones de la compra), y el nombre de la cuenta se
-- lee de pos_cuentas. Se limpian las ventas que ya tienen su cuenta enlazada.
-- Se puede repetir sin efecto.

BEGIN;

UPDATE ventas v SET observaciones = NULL
WHERE v.observaciones ~ '^Punto de venta · '
  AND EXISTS (SELECT 1 FROM pos_cuentas c WHERE c.venta_id = v.id);

COMMIT;
