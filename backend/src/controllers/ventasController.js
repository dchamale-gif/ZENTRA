const pool = require('../db/connection');

const VENTA_SELECT = `
  SELECT v.id, v.numero_venta, v.cliente_id, v.user_id,
         v.fecha, v.hora, v.subtotal, v.descuento, v.impuesto, v.total,
         v.metodo_pago, v.estado, v.observaciones, v.created_at, v.updated_at,
         COALESCE(c.nombre, 'Consumidor final') AS receptor_nombre,
         CASE WHEN v.cliente_id IS NOT NULL THEN 'cliente' ELSE 'consumidor' END AS receptor_tipo,
         COALESCE(
           json_agg(
             json_build_object(
               'id', vi.id,
               'tipo', CASE WHEN vi.medicina_id IS NOT NULL THEN 'medicina'
                            WHEN vi.articulo_id IS NOT NULL THEN 'articulo' ELSE 'general' END,
               'concepto_id', COALESCE(vi.medicina_id, vi.articulo_id),
               'concepto_nombre', COALESCE(m.nombre, a.nombre_articulo, vi.descripcion),
               'cantidad', vi.cantidad,
               'precio_unitario', vi.precio_unitario,
               'subtotal', vi.subtotal
             ) ORDER BY vi.created_at, vi.id
           ) FILTER (WHERE vi.id IS NOT NULL),
           '[]'::json
         ) AS items
  FROM ventas v
  LEFT JOIN clientes c ON c.id = v.cliente_id
  LEFT JOIN venta_items vi ON vi.venta_id = v.id
  LEFT JOIN medicinas m ON m.id = vi.medicina_id
  LEFT JOIN codigos_articulos a ON a.id = vi.articulo_id
`;

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('La venta debe incluir al menos un concepto');
    error.status = 400;
    throw error;
  }

  return items.map((item, index) => {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precio_unitario);
    const conceptoId = String(item.concepto_id || '').trim();
    if (!['articulo', 'medicina'].includes(item.tipo) || !conceptoId) {
      const error = new Error(`Concepto ${index + 1}: tipo y producto son requeridos`);
      error.status = 400;
      throw error;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0 || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
      const error = new Error(`Concepto ${index + 1}: cantidad o precio no válido`);
      error.status = 400;
      throw error;
    }
    return {
      tipo: item.tipo,
      conceptoId,
      cantidad,
      precioUnitario,
      subtotal: Number((cantidad * precioUnitario).toFixed(2))
    };
  });
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
    const result = await client.query(
      `SELECT ${stockColumn} AS stock FROM ${table} WHERE id = $1 FOR UPDATE`,
      [item.conceptoId]
    );
    if (result.rows.length === 0) {
      const error = new Error(`El concepto ${item.conceptoId} no existe`);
      error.status = 400;
      throw error;
    }
    if (Number(result.rows[0].stock) < item.cantidad) {
      const error = new Error(`Existencia insuficiente para ${item.conceptoId}`);
      error.status = 409;
      throw error;
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
    } else {
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
  if (!customerId) return;
  const receiver = await client.query(
    'SELECT id FROM clientes WHERE id = $1',
    [customerId]
  );
  if (receiver.rows.length === 0) {
    const error = new Error('El receptor seleccionado no existe');
    error.status = 400;
    throw error;
  }
};

const getVentas = async (req, res) => {
  try {
    const result = await pool.query(
      `${VENTA_SELECT} GROUP BY v.id, c.nombre
       ORDER BY v.fecha DESC, v.created_at DESC`
    );
    res.status(200).json({ success: true, total: result.rows.length, ventas: result.rows });
  } catch (error) {
    console.error('Error en getVentas:', error);
    res.status(500).json({ error: 'Error obteniendo ventas' });
  }
};

const getReceptores = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, nit, telefono FROM clientes WHERE activo = true ORDER BY nombre'
    );
    const receptores = result.rows.map(row => ({ ...row, tipo: 'cliente' }));
    res.status(200).json({ success: true, total: receptores.length, receptores });
  } catch (error) {
    console.error('Error en getReceptores:', error);
    res.status(500).json({ error: 'Error obteniendo clientes' });
  }
};

const createVenta = async (req, res) => {
  let client;
  try {
    const { cliente_id, fecha, metodo_pago = 'efectivo', observaciones } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha es requerida' });
    const items = normalizeItems(req.body.items);
    const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

    client = await pool.connect();
    await client.query('BEGIN');
    await validateReceiver(client, cliente_id);
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
      [ventaId, numeroVenta, cliente_id || null, req.user.id,
        fecha, subtotal, metodo_pago, observaciones || null]
    );
    await insertItems(client, ventaId, items);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Venta creada exitosamente', venta: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error en createVenta:', error);
    res.status(error.status || (error.code === '23503' ? 400 : 500)).json({ error: error.message || 'Error creando venta' });
  } finally {
    if (client) client.release();
  }
};

const updateVenta = async (req, res) => {
  let client;
  try {
    const { cliente_id, fecha, metodo_pago = 'efectivo', observaciones } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha es requerida' });
    const items = normalizeItems(req.body.items);
    const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

    client = await pool.connect();
    await client.query('BEGIN');
    await validateReceiver(client, cliente_id);
    const existing = await client.query('SELECT id FROM ventas WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (existing.rows.length === 0) {
      const error = new Error('Venta no encontrada');
      error.status = 404;
      throw error;
    }
    await restoreStock(client, req.params.id);
    await validateAndDiscountStock(client, items);
    const result = await client.query(
      `UPDATE ventas SET cliente_id = $1, fecha = $2, subtotal = $3,
       descuento = 0, impuesto = 0, total = $3, metodo_pago = $4, observaciones = $5,
       updated_at = NOW() WHERE id = $6 RETURNING *`,
      [cliente_id || null, fecha, subtotal, metodo_pago,
        observaciones || null, req.params.id]
    );
    await client.query('DELETE FROM venta_items WHERE venta_id = $1', [req.params.id]);
    await insertItems(client, req.params.id, items);
    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Venta actualizada exitosamente', venta: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error en updateVenta:', error);
    res.status(error.status || (error.code === '23503' ? 400 : 500)).json({ error: error.message || 'Error actualizando venta' });
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
    if (existing.rows.length === 0) {
      const error = new Error('Venta no encontrada');
      error.status = 404;
      throw error;
    }
    await restoreStock(client, req.params.id);
    await client.query('DELETE FROM ventas WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Venta eliminada e inventario restituido' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error en deleteVenta:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error eliminando venta' });
  } finally {
    if (client) client.release();
  }
};

module.exports = { getVentas, getReceptores, createVenta, updateVenta, deleteVenta };