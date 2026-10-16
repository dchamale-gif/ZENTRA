const { generateId } = require('./helpers');

// Registra un movimiento de caja dentro de la transacción del llamador.
// direccion: 'entrada' | 'salida' | 'transferencia'.
const registrarMovimientoCaja = async (client, {
  direccion,
  tipoMovimiento,
  monto,
  descripcion,
  fecha,
  hora = null,
  clienteId = null,
  referencia = null,
  referenciaVentaId = null,
  referenciaCompraId = null,
  userId = null
}) => {
  await client.query('LOCK TABLE caja IN SHARE ROW EXCLUSIVE MODE');
  // Saldo a partir de los movimientos activos, para que anular uno no descuadre los siguientes.
  const balance = await client.query(`
    SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN monto WHEN tipo = 'salida' THEN -monto ELSE 0 END), 0) AS saldo
    FROM caja
    WHERE COALESCE(estado, 'activo') = 'activo'
  `);
  const saldoAnterior = Number(balance.rows[0].saldo);
  const delta = direccion === 'entrada' ? monto : (direccion === 'salida' ? -monto : 0);

  const result = await client.query(`
    INSERT INTO caja (
      id, tipo, tipo_movimiento, concepto, categoria, monto, descripcion,
      cliente_id, referencia, referencia_venta_id, referencia_compra_id, user_id,
      fecha, hora, saldo_anterior, saldo_posterior, estado
    ) VALUES ($1, $2, $3, $4, $3, $5, $6, $7, $8, $9, $10, $11, $12,
              COALESCE($13::time, CURRENT_TIME), $14, $15, 'activo')
    RETURNING *
  `, [
    generateId('CAJ'), direccion, tipoMovimiento, descripcion.slice(0, 150), monto, descripcion,
    clienteId, referencia, referenciaVentaId, referenciaCompraId, userId,
    fecha, hora, saldoAnterior, saldoAnterior + delta
  ]);
  return result.rows[0];
};

// Anula los movimientos de caja generados por una venta y suelta la referencia
// para que la venta pueda modificarse o eliminarse.
const anularMovimientosDeVenta = async (client, ventaId) => {
  await client.query(`
    UPDATE caja
    SET estado = 'anulado', referencia_venta_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE referencia_venta_id = $1
  `, [ventaId]);
};

module.exports = { registrarMovimientoCaja, anularMovimientosDeVenta };
