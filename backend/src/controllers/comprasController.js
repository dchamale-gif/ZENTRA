const pool = require('../db/connection');

const COMPRA_SELECT = `
  SELECT c.id, c.numero_compra, c.proveedor_id, p.nombre AS proveedor_nombre,
         c.user_id, c.fecha, c.fecha_entrega, c.total, c.estado,
         c.observaciones, c.created_at, c.updated_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id', ci.id,
               'tipo', CASE WHEN ci.medicina_id IS NOT NULL THEN 'medicina' ELSE 'articulo' END,
               'concepto_id', COALESCE(ci.medicina_id, ci.articulo_id),
               'concepto_nombre', COALESCE(m.nombre, a.nombre_articulo),
               'cantidad', ci.cantidad,
               'precio_unitario', ci.precio_unitario,
               'subtotal', ci.subtotal
             ) ORDER BY ci.created_at, ci.id
           ) FILTER (WHERE ci.id IS NOT NULL),
           '[]'::json
         ) AS items
  FROM compras c
  JOIN proveedores p ON p.id = c.proveedor_id
  LEFT JOIN compra_items ci ON ci.compra_id = c.id
  LEFT JOIN medicinas m ON m.id = ci.medicina_id
  LEFT JOIN codigos_articulos a ON a.id = ci.articulo_id
`;

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('La compra debe incluir al menos un concepto');
    error.status = 400;
    throw error;
  }

  return items.map((item, index) => {
    const tipo = item.tipo;
    const conceptoId = String(item.concepto_id || '').trim();
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precio_unitario);

    if (!['articulo', 'medicina'].includes(tipo) || !conceptoId) {
      const error = new Error(`Concepto ${index + 1}: tipo y producto son requeridos`);
      error.status = 400;
      throw error;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      const error = new Error(`Concepto ${index + 1}: la cantidad debe ser un entero mayor a cero`);
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      const error = new Error(`Concepto ${index + 1}: el costo unitario no es válido`);
      error.status = 400;
      throw error;
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

const getNextNumeroCompra = async (client) => {
  const result = await client.query(
    `SELECT numero_compra
     FROM compras
     WHERE numero_compra ~ '[0-9]+$'
     ORDER BY ((regexp_match(numero_compra, '([0-9]+)$'))[1])::BIGINT DESC
     LIMIT 1`
  );
  const parts = result.rows[0]?.numero_compra?.match(/^(.*?)(\d+)$/);
  if (!parts) return 'COMP-001';
  return `${parts[1]}${String(Number(parts[2]) + 1).padStart(parts[2].length, '0')}`;
};

const insertItems = async (client, compraId, items) => {
  for (const item of items) {
    const itemId = `CI-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await client.query(
      `INSERT INTO compra_items
       (id, compra_id, medicina_id, articulo_id, cantidad, precio_unitario, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        itemId,
        compraId,
        item.tipo === 'medicina' ? item.conceptoId : null,
        item.tipo === 'articulo' ? item.conceptoId : null,
        item.cantidad,
        item.precioUnitario,
        item.subtotal
      ]
    );
  }
};

const validateTenantReferences = async (client, providerId, items) => {
  const provider = await client.query(
    'SELECT id FROM proveedores WHERE id = $1',
    [providerId]
  );
  if (provider.rows.length === 0) {
    const error = new Error('El proveedor seleccionado no existe');
    error.status = 400;
    throw error;
  }

  for (const item of items) {
    const table = item.tipo === 'medicina' ? 'medicinas' : 'codigos_articulos';
    const concept = await client.query(
      `SELECT id FROM ${table} WHERE id = $1`,
      [item.conceptoId]
    );
    if (concept.rows.length === 0) {
      const error = new Error(`El concepto ${item.conceptoId} no existe`);
      error.status = 400;
      throw error;
    }
  }
};

const getCompras = async (req, res) => {
  try {
    const result = await pool.query(
      `${COMPRA_SELECT}
       GROUP BY c.id, p.nombre
       ORDER BY c.fecha DESC, c.created_at DESC`
    );
    res.status(200).json({ success: true, total: result.rows.length, compras: result.rows });
  } catch (error) {
    console.error('Error en getCompras:', error);
    res.status(500).json({ error: 'Error obteniendo compras' });
  }
};

const getCompraById = async (req, res) => {
  try {
    const result = await pool.query(
      `${COMPRA_SELECT}
       WHERE c.id = $1
       GROUP BY c.id, p.nombre`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Compra no encontrada' });
    res.status(200).json({ success: true, compra: result.rows[0] });
  } catch (error) {
    console.error('Error en getCompraById:', error);
    res.status(500).json({ error: 'Error obteniendo compra' });
  }
};

const createCompra = async (req, res) => {
  let client;
  try {
    const { proveedor_id, fecha, fecha_entrega, estado = 'pendiente', observaciones } = req.body;
    if (!proveedor_id || !fecha) return res.status(400).json({ error: 'Proveedor y fecha son requeridos' });

    const items = normalizeItems(req.body.items);
    const total = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    client = await pool.connect();
    await client.query('BEGIN');
    await validateTenantReferences(client, proveedor_id, items);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('compras_numero_correlativo'))");
    const numeroCompra = await getNextNumeroCompra(client);
    const compraId = `COM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const result = await client.query(
      `INSERT INTO compras
       (id, numero_compra, proveedor_id, user_id, fecha, fecha_entrega, total, estado, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [compraId, numeroCompra, proveedor_id, req.user.id, fecha, fecha_entrega || null,
        total, estado, observaciones || null]
    );
    await insertItems(client, compraId, items);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Compra creada exitosamente', compra: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error en createCompra:', error);
    const status = error.status || (error.code === '23503' ? 400 : 500);
    res.status(status).json({ error: error.code === '23503' ? 'Proveedor o concepto no válido' : error.message || 'Error creando compra' });
  } finally {
    if (client) client.release();
  }
};

const updateCompra = async (req, res) => {
  let client;
  try {
    const { proveedor_id, fecha, fecha_entrega, estado = 'pendiente', observaciones } = req.body;
    if (!proveedor_id || !fecha) return res.status(400).json({ error: 'Proveedor y fecha son requeridos' });

    const items = normalizeItems(req.body.items);
    const total = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    client = await pool.connect();
    await client.query('BEGIN');
    await validateTenantReferences(client, proveedor_id, items);
    const existing = await client.query('SELECT id FROM compras WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Compra no encontrada' });
    }

    const result = await client.query(
      `UPDATE compras
       SET proveedor_id = $1, fecha = $2, fecha_entrega = $3, total = $4,
           estado = $5, observaciones = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [proveedor_id, fecha, fecha_entrega || null, total, estado, observaciones || null, req.params.id]
    );
    await client.query('DELETE FROM compra_items WHERE compra_id = $1', [req.params.id]);
    await insertItems(client, req.params.id, items);
    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Compra actualizada exitosamente', compra: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error en updateCompra:', error);
    const status = error.status || (error.code === '23503' ? 400 : 500);
    res.status(status).json({ error: error.code === '23503' ? 'Proveedor o concepto no válido' : error.message || 'Error actualizando compra' });
  } finally {
    if (client) client.release();
  }
};

const deleteCompra = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM compras WHERE id = $1 RETURNING id, numero_compra', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Compra no encontrada' });
    res.status(200).json({ success: true, message: 'Compra eliminada exitosamente', compra: result.rows[0] });
  } catch (error) {
    console.error('Error en deleteCompra:', error);
    res.status(500).json({ error: 'Error eliminando compra' });
  }
};

module.exports = { getCompras, getCompraById, createCompra, updateCompra, deleteCompra };