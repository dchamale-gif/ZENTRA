const pool = require('../db/connection');
const { dbInputErrorMessage } = require('../utils/inventory');
const { registrarMovimientoCaja, anularMovimientosDeVenta } = require('../utils/cajaLedger');

const METODOS_PAGO = new Set(['efectivo', 'tarjeta', 'transferencia', 'credito']);

const VENTA_SELECT = `
  SELECT v.id, v.numero_venta, v.cliente_id, v.user_id,
         v.fecha, v.hora, v.subtotal, v.descuento, v.impuesto, v.total,
         v.metodo_pago, v.estado, v.observaciones, v.created_at, v.updated_at,
         COALESCE(c.nombre, 'Consumidor final') AS receptor_nombre,
         CASE WHEN v.cliente_id IS NOT NULL THEN 'cliente' ELSE 'consumidor' END AS receptor_tipo,
         COALESCE(pg.pagado, 0) AS pagado,
         GREATEST(v.total - COALESCE(pg.pagado, 0), 0) AS pendiente,
         COALESCE(
           json_agg(
             json_build_object(
               'id', vi.id,
               'tipo', CASE WHEN vi.medicina_id IS NOT NULL THEN 'medicina'
                            WHEN vi.articulo_id IS NOT NULL THEN 'articulo' ELSE 'general' END,
               'concepto_id', COALESCE(vi.medicina_id, vi.articulo_id),
               'concepto_nombre', COALESCE(m.nombre, a.nombre_articulo, 'Concepto general'),
               'concepto_codigo', a.codigo,
               'cantidad', vi.cantidad,
               'precio_unitario', vi.precio_unitario,
               'subtotal', vi.subtotal
             ) ORDER BY vi.created_at, vi.id
           ) FILTER (WHERE vi.id IS NOT NULL),
           '[]'::json
         ) AS items
  FROM ventas v
  LEFT JOIN clientes c ON c.id = v.cliente_id
  LEFT JOIN (
    SELECT venta_id, SUM(monto) AS pagado FROM pagos_factura GROUP BY venta_id
  ) pg ON pg.venta_id = v.id
  LEFT JOIN venta_items vi ON vi.venta_id = v.id
  LEFT JOIN medicinas m ON m.id = vi.medicina_id
  LEFT JOIN codigos_articulos a ON a.id = vi.articulo_id
`;
const VENTA_GROUP_BY = 'GROUP BY v.id, c.nombre, pg.pagado';

const httpError = (status, message) => Object.assign(new Error(message), { status });

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError(400, 'La venta debe incluir al menos un artículo');
  }

  return items.map((item, index) => {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precio_unitario);
    const conceptoId = String(item.concepto_id || '').trim();
    const tipo = item.tipo || 'articulo';
    if (!['articulo', 'medicina'].includes(tipo) || !conceptoId) {
      throw httpError(400, `Línea ${index + 1}: selecciona un artículo`);
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw httpError(400, `Línea ${index + 1}: cantidad o precio no válido`);
    }
    return {
      tipo,
      conceptoId,
      cantidad,
      precioUnitario,
      subtotal: Number((cantidad * precioUnitario).toFixed(2))
    };
  });
};

const normalizeHeader = (body) => {
  const metodoPago = String(body.metodo_pago || 'efectivo').toLowerCase();
  if (!METODOS_PAGO.has(metodoPago)) throw httpError(400, 'Método de pago no válido');
  if (!body.fecha) throw httpError(400, 'La fecha es requerida');
  const clienteId = body.cliente_id ? String(body.cliente_id) : null;
  if (metodoPago === 'credito' && !clienteId) {
    throw httpError(400, 'Las ventas al crédito requieren un cliente para poder cobrarlas después');
  }
  return {
    clienteId,
    fecha: body.fecha,
    metodoPago,
    observaciones: body.observaciones ? String(body.observaciones).trim() : null
  };
};

const getNextNumeroVenta = async (client) => {
  const result = await client.query(
    `SELECT numero_venta FROM ventas WHERE numero_venta ~ '[0-9]+$'
     ORDER BY ((regexp_match(numero_venta, '([0-9]+)$'))[1])::BIGINT DESC LIMIT 1`
  );
  const parts = result.rows[0]?.numero_venta?.match(/^(.*?)(\d+)$/);
  if (!parts) return 'VTA-001';
  return `${parts[1]}${String(Number(parts[2]) + 1).padStart(parts[2].length, '0')}`;
};

const validateAndDiscountStock = async (client, items) => {
  for (const item of items) {
    const isMedicine = item.tipo === 'medicina';
    const table = isMedicine ? 'medicinas' : 'codigos_articulos';
    const stockColumn = isMedicine ? 'cantidad' : 'cantidad_disponible';
    const nameColumn = isMedicine ? 'nombre' : 'nombre_articulo';
    const result = await client.query(
      `SELECT ${stockColumn} AS stock, ${nameColumn} AS nombre FROM ${table} WHERE id = $1 FOR UPDATE`,
      [item.conceptoId]
    );
    if (result.rows.length === 0) {
      throw httpError(400, 'Uno de los artículos ya no existe; vuelve a seleccionarlo');
    }
    const { stock, nombre } = result.rows[0];
    if (Number(stock) < item.cantidad) {
      throw httpError(409, `No hay suficiente existencia de «${nombre}»: hay ${Number(stock) || 0} y quieres vender ${item.cantidad}. Baja la cantidad o registra una compra.`);
    }
    await client.query(
      `UPDATE ${table} SET ${stockColumn} = ${stockColumn} - $1, updated_at = NOW() WHERE id = $2`,
      [item.cantidad, item.conceptoId]
    );
  }
};

const restoreStock = async (client, ventaId) => {
  const result = await client.query(
    'SELECT medicina_id, articulo_id, cantidad FROM venta_items WHERE venta_id = $1 FOR UPDATE',
    [ventaId]
  );
  for (const item of result.rows) {
    if (item.medicina_id) {
      await client.query(
        'UPDATE medicinas SET cantidad = cantidad + $1, updated_at = NOW() WHERE id = $2',
        [item.cantidad, item.medicina_id]
      );
    } else if (item.articulo_id) {
      await client.query(
        'UPDATE codigos_articulos SET cantidad_disponible = cantidad_disponible + $1, updated_at = NOW() WHERE id = $2',
        [item.cantidad, item.articulo_id]
      );
    }
  }
};

const insertItems = async (client, ventaId, items) => {
  for (const item of items) {
    const itemId = `VI-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await client.query(
      `INSERT INTO venta_items
       (id, venta_id, medicina_id, articulo_id, cantidad, precio_unitario, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [itemId, ventaId, item.tipo === 'medicina' ? item.conceptoId : null,
        item.tipo === 'articulo' ? item.conceptoId : null, item.cantidad,
        item.precioUnitario, item.subtotal]
    );
  }
};

const validateReceiver = async (client, customerId) => {
  if (!customerId) return null;
  const receiver = await client.query(
    'SELECT id, nombre FROM clientes WHERE id = $1',
    [customerId]
  );
  if (receiver.rows.length === 0) throw httpError(400, 'El cliente seleccionado no existe');
  return receiver.rows[0];
};

// Abonos registrados en Cuentas por Cobrar (no incluye el pago automático de contado).
const getAbonos = async (client, ventaId) => {
  const result = await client.query(
    `SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_factura WHERE venta_id = $1 AND origen <> 'contado'`,
    [ventaId]
  );
  return Number(result.rows[0].total);
};

// Una venta de contado queda pagada al registrarse y, si es en efectivo, entra a caja.
// Una venta al crédito queda pendiente en Cuentas por Cobrar.
const aplicarPago = async (client, venta, userId) => {
  if (venta.metodo_pago === 'credito' || Number(venta.total) <= 0) return;
  await client.query(
    `INSERT INTO pagos_factura (id, venta_id, monto, fecha, metodo_pago, observaciones, usuario_id, origen)
     VALUES ($1, $2, $3, $4, $5, 'Pago de contado', $6, 'contado')`,
    [`PAG-CONT-${venta.id}`, venta.id, venta.total, venta.fecha, venta.metodo_pago, userId]
  );
  if (venta.metodo_pago === 'efectivo') {
    await registrarMovimientoCaja(client, {
      direccion: 'entrada',
      tipoMovimiento: 'Ingreso por Venta',
      monto: Number(venta.total),
      descripcion: `Venta ${venta.numero_venta}`,
      fecha: venta.fecha,
      clienteId: venta.cliente_id,
      referencia: venta.numero_venta,
      referenciaVentaId: venta.id,
      userId
    });
  }
};

const revertirPago = async (client, ventaId) => {
  await client.query(`DELETE FROM pagos_factura WHERE venta_id = $1 AND origen = 'contado'`, [ventaId]);
  await anularMovimientosDeVenta(client, ventaId);
};

const sendError = (res, error, fallback) => {
  const inputError = dbInputErrorMessage(error);
  if (inputError) return res.status(400).json({ error: inputError });
  console.error(fallback, error);
  const status = error.status || (error.code === '23503' ? 400 : 500);
  res.status(status).json({ error: status === 500 ? fallback : error.message });
};

const getVentas = async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.cliente_id) {
      params.push(req.query.cliente_id);
      where = `WHERE v.cliente_id = $${params.length}`;
    }
    const result = await pool.query(
      `${VENTA_SELECT} ${where} ${VENTA_GROUP_BY}
       ORDER BY v.fecha DESC, v.created_at DESC`,
      params
    );
    res.status(200).json({ success: true, total: result.rows.length, ventas: result.rows });
  } catch (error) {
    sendError(res, error, 'Error obteniendo ventas');
  }
};

const getReceptores = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, nit, dpi, telefono FROM clientes WHERE activo = true ORDER BY nombre'
    );
    const receptores = result.rows.map(row => ({ ...row, tipo: 'cliente' }));
    res.status(200).json({ success: true, total: receptores.length, receptores });
  } catch (error) {
    sendError(res, error, 'Error obteniendo clientes');
  }
};

const createVenta = async (req, res) => {
  let client;
  try {
    const header = normalizeHeader(req.body);
    const items = normalizeItems(req.body.items);
    const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

    client = await pool.connect();
    await client.query('BEGIN');
    await validateReceiver(client, header.clienteId);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ventas_numero_correlativo'))");
    await validateAndDiscountStock(client, items);
    const numeroVenta = await getNextNumeroVenta(client);
    const ventaId = `VTA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const result = await client.query(
      `INSERT INTO ventas
       (id, numero_venta, cliente_id, user_id, fecha, hora, subtotal,
        descuento, impuesto, total, metodo_pago, estado, observaciones)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIME, $6, 0, 0, $6, $7, 'completada', $8)
       RETURNING *`,
      [ventaId, numeroVenta, header.clienteId, req.user.id,
        header.fecha, subtotal, header.metodoPago, header.observaciones]
    );
    await insertItems(client, ventaId, items);
    await aplicarPago(client, { ...result.rows[0], fecha: header.fecha }, req.user.id);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Venta creada exitosamente', venta: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error creando venta');
  } finally {
    if (client) client.release();
  }
};

const updateVenta = async (req, res) => {
  let client;
  try {
    const header = normalizeHeader(req.body);
    const items = normalizeItems(req.body.items);
    const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

    client = await pool.connect();
    await client.query('BEGIN');
    await validateReceiver(client, header.clienteId);
    const existing = await client.query('SELECT id FROM ventas WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (existing.rows.length === 0) throw httpError(404, 'Venta no encontrada');

    const abonos = await getAbonos(client, req.params.id);
    if (abonos > 0 && header.metodoPago !== 'credito') {
      throw httpError(409, 'La venta ya tiene abonos en Cuentas por Cobrar; debe seguir siendo al crédito');
    }
    if (abonos > subtotal + 0.005) {
      throw httpError(409, `El nuevo total (Q${subtotal.toFixed(2)}) es menor a lo ya abonado (Q${abonos.toFixed(2)})`);
    }

    await revertirPago(client, req.params.id);
    await restoreStock(client, req.params.id);
    await validateAndDiscountStock(client, items);
    const result = await client.query(
      `UPDATE ventas SET cliente_id = $1, fecha = $2, subtotal = $3,
       descuento = 0, impuesto = 0, total = $3, metodo_pago = $4, observaciones = $5,
       updated_at = NOW() WHERE id = $6 RETURNING *`,
      [header.clienteId, header.fecha, subtotal, header.metodoPago, header.observaciones, req.params.id]
    );
    await client.query('DELETE FROM venta_items WHERE venta_id = $1', [req.params.id]);
    await insertItems(client, req.params.id, items);
    await aplicarPago(client, { ...result.rows[0], fecha: header.fecha }, req.user.id);
    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Venta actualizada exitosamente', venta: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error actualizando venta');
  } finally {
    if (client) client.release();
  }
};

const deleteVenta = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM ventas WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (existing.rows.length === 0) throw httpError(404, 'Venta no encontrada');
    if (await getAbonos(client, req.params.id) > 0) {
      throw httpError(409, 'La venta tiene abonos registrados en Cuentas por Cobrar y no se puede eliminar');
    }
    await revertirPago(client, req.params.id);
    await restoreStock(client, req.params.id);
    await client.query('DELETE FROM ventas WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Venta eliminada, inventario restituido y caja ajustada' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error eliminando venta');
  } finally {
    if (client) client.release();
  }
};

module.exports = { getVentas, getReceptores, createVenta, updateVenta, deleteVenta };
