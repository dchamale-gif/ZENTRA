const pool = require('../db/connection');
const { dbInputErrorMessage } = require('../utils/inventory');

const ESTADOS_COMPRA = new Set(['pendiente', 'ordenada', 'recibida', 'cancelada']);

const httpError = (status, message) => Object.assign(new Error(message), { status });

const normalizeEstado = (estado = 'pendiente') => {
  const value = String(estado).toLowerCase();
  if (!ESTADOS_COMPRA.has(value)) throw httpError(400, 'Estado de compra no válido');
  return value;
};

const COMPRA_SELECT = `
  SELECT c.id, c.numero_compra, c.proveedor_id, p.nombre AS proveedor_nombre,
         c.user_id, c.fecha, c.fecha_entrega, c.total, c.estado, c.inventario_aplicado,
         c.observaciones, c.created_at, c.updated_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id', ci.id,
               'tipo', CASE WHEN ci.medicina_id IS NOT NULL THEN 'medicina' ELSE 'articulo' END,
               'concepto_id', COALESCE(ci.medicina_id, ci.articulo_id),
               'concepto_nombre', COALESCE(m.nombre, a.nombre_articulo),
               'concepto_codigo', a.codigo,
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

// Suma (signo 1) o resta (signo -1) los artículos de la compra en el inventario.
// Al recibir, el costo del artículo pasa a ser el último costo de compra.
const moverInventario = async (client, compraId, signo) => {
  await client.query(
    `SELECT id FROM codigos_articulos
     WHERE id IN (SELECT articulo_id FROM compra_items WHERE compra_id = $1)
     FOR UPDATE`,
    [compraId]
  );
  // Agrupado por artículo por si la compra lo trae en varias líneas.
  const items = await client.query(
    `SELECT ci.articulo_id, SUM(ci.cantidad)::INTEGER AS cantidad,
            ROUND(SUM(ci.subtotal) / NULLIF(SUM(ci.cantidad), 0), 2) AS precio_unitario,
            a.nombre_articulo, a.cantidad_disponible
     FROM compra_items ci
     JOIN codigos_articulos a ON a.id = ci.articulo_id
     WHERE ci.compra_id = $1
     GROUP BY ci.articulo_id, a.nombre_articulo, a.cantidad_disponible`,
    [compraId]
  );
  for (const item of items.rows) {
    if (signo < 0 && Number(item.cantidad_disponible) < item.cantidad) {
      throw httpError(409,
        `No se puede revertir la compra: de "${item.nombre_articulo}" quedan ${item.cantidad_disponible} y la compra trajo ${item.cantidad} (ya se vendieron)`);
    }
    await client.query(
      `UPDATE codigos_articulos
       SET cantidad_disponible = COALESCE(cantidad_disponible, 0) + $1,
           precio_costo = CASE WHEN $1 > 0 THEN $2 ELSE precio_costo END,
           updated_at = NOW()
       WHERE id = $3`,
      [signo * item.cantidad, item.precio_unitario, item.articulo_id]
    );
  }
  await client.query(
    'UPDATE compras SET inventario_aplicado = $1 WHERE id = $2',
    [signo > 0, compraId]
  );
};

const sendError = (res, error, fallback) => {
  const inputError = dbInputErrorMessage(error);
  if (inputError) return res.status(400).json({ error: inputError });
  console.error(fallback, error);
  const status = error.status || (error.code === '23503' ? 400 : 500);
  const message = error.code === '23503' ? 'Proveedor o artículo no válido' : (status === 500 ? fallback : error.message);
  res.status(status).json({ error: message });
};

const getCompras = async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.proveedor_id) {
      params.push(req.query.proveedor_id);
      where = `WHERE c.proveedor_id = $${params.length}`;
    }
    const result = await pool.query(
      `${COMPRA_SELECT}
       ${where}
       GROUP BY c.id, p.nombre
       ORDER BY c.fecha DESC, c.created_at DESC`,
      params
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
    const { proveedor_id, fecha, fecha_entrega, observaciones } = req.body;
    if (!proveedor_id || !fecha) return res.status(400).json({ error: 'Proveedor y fecha son requeridos' });
    const estado = normalizeEstado(req.body.estado);

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
    if (estado === 'recibida') await moverInventario(client, compraId, 1);
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: estado === 'recibida' ? 'Compra registrada y existencias actualizadas' : 'Compra registrada',
      compra: result.rows[0]
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error creando compra');
  } finally {
    if (client) client.release();
  }
};

const updateCompra = async (req, res) => {
  let client;
  try {
    const { proveedor_id, fecha, fecha_entrega, observaciones } = req.body;
    if (!proveedor_id || !fecha) return res.status(400).json({ error: 'Proveedor y fecha son requeridos' });
    const estado = normalizeEstado(req.body.estado);

    const items = normalizeItems(req.body.items);
    const total = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    client = await pool.connect();
    await client.query('BEGIN');
    await validateTenantReferences(client, proveedor_id, items);
    const existing = await client.query(
      'SELECT id, inventario_aplicado FROM compras WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (existing.rows.length === 0) throw httpError(404, 'Compra no encontrada');

    // Se deshace lo que la versión anterior sumó al inventario y se aplica la nueva.
    if (existing.rows[0].inventario_aplicado) await moverInventario(client, req.params.id, -1);

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
    if (estado === 'recibida') await moverInventario(client, req.params.id, 1);
    await client.query('COMMIT');
    res.status(200).json({
      success: true,
      message: estado === 'recibida' ? 'Compra actualizada y existencias recalculadas' : 'Compra actualizada',
      compra: result.rows[0]
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error actualizando compra');
  } finally {
    if (client) client.release();
  }
};

const deleteCompra = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id, numero_compra, inventario_aplicado FROM compras WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (existing.rows.length === 0) throw httpError(404, 'Compra no encontrada');
    if (existing.rows[0].inventario_aplicado) await moverInventario(client, req.params.id, -1);
    await client.query('DELETE FROM compras WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.status(200).json({
      success: true,
      message: existing.rows[0].inventario_aplicado
        ? 'Compra eliminada y existencias descontadas'
        : 'Compra eliminada exitosamente',
      compra: { id: existing.rows[0].id, numero_compra: existing.rows[0].numero_compra }
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error eliminando compra');
  } finally {
    if (client) client.release();
  }
};

module.exports = { getCompras, getCompraById, createCompra, updateCompra, deleteCompra };