-- Migración: integración de ventas, cobros, caja, compras e inventario.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

-- Pagos generados al vender de contado ('contado') frente a abonos de crédito ('abono').
ALTER TABLE pagos_factura ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'abono';

-- Indica si la compra ya sumó sus artículos al inventario.
ALTER TABLE compras ADD COLUMN IF NOT EXISTS inventario_aplicado BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE caja ADD COLUMN IF NOT EXISTS referencia_venta_id VARCHAR(50) REFERENCES ventas(id);
ALTER TABLE caja ADD COLUMN IF NOT EXISTS referencia_compra_id VARCHAR(50) REFERENCES compras(id);
CREATE INDEX IF NOT EXISTS idx_caja_referencia_venta ON caja (referencia_venta_id);

-- Las ventas de contado registradas antes de esta migración no tenían pago y
-- aparecían como cuentas por cobrar: se les registra el pago de contado.
INSERT INTO pagos_factura (id, venta_id, monto, fecha, metodo_pago, observaciones, organization_id, origen)
SELECT 'PAG-CONT-' || v.id, v.id, v.total, v.fecha, v.metodo_pago,
       'Pago de contado registrado al migrar', v.organization_id, 'contado'
FROM ventas v
WHERE COALESCE(v.metodo_pago, 'efectivo') <> 'credito'
  AND COALESCE(v.estado, 'completada') <> 'anulada'
  AND v.total > 0
  AND NOT EXISTS (SELECT 1 FROM pagos_factura p WHERE p.venta_id = v.id)
ON CONFLICT (id) DO NOTHING;

COMMIT;
