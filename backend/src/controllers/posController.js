const pool = require('../db/connection');
const { generateId } = require('../utils/helpers');
const { registrarVenta, sendError, httpError } = require('./ventasController');
const { FOTO_VERSION_COLUMN } = require('../utils/fotos');
const { prepararFactura, emitirFactura } = require('./felController');

// El punto de venta cobra al momento; las ventas al crédito se registran en Ventas.
const METODOS_COBRO = new Set(['efectivo', 'tarjeta', 'transferencia']);
const MAX_CANTIDAD = 999;

const userName = (user) => [user.nombre, user.apellido].filter(Boolean).join(' ') || user.email;

const CUENTA_SELECT = `
  SELECT c.id, c.nombre, c.estado, c.version, c.abierta_por_nombre, c.created_at, c.updated_at,
         COALESCE(SUM(i.cantidad), 0)::INTEGER AS unidades,
         COALESCE(SUM(i.cantidad * i.precio_unitario), 0) AS total
  FROM pos_cuentas c
  LEFT JOIN pos_cuenta_items i ON i.cuenta_id = c.id
`;

// Bloquea la cuenta para que nadie la cobre mientras otro usuario le agrega productos.
const lockCuentaAbierta = async (client, cuentaId) => {
  const result = await client.query('SELECT id, nombre, estado FROM pos_cuentas WHERE id = $1 FOR UPDATE', [cuentaId]);
  const cuenta = result.rows[0];
  if (!cuenta) throw httpError(404, 'La cuenta ya no existe; elige otra de la lista');
  if (cuenta.estado !== 'abierta') {
    throw httpError(409, `La cuenta «${cuenta.nombre}» ya fue ${cuenta.estado}; elige otra de la lista`);
  }
  return cuenta;
};

const touchCuenta = (client, cuentaId) => client.query(
  'UPDATE pos_cuentas SET version = version + 1, updated_at = NOW() WHERE id = $1',
  [cuentaId]
);

const getCuentaDetalle = async (db, cuentaId) => {
  const cuenta = await db.query(`${CUENTA_SELECT} WHERE c.id = $1 GROUP BY c.id`, [cuentaId]);
  if (!cuenta.rows[0]) return null;
  const items = await db.query(
    `SELECT i.id, i.articulo_id, a.nombre_articulo AS nombre, a.codigo, i.cantidad,
            i.precio_unitario, i.nota, i.user_id, i.usuario_nombre, i.created_at
     FROM pos_cuenta_items i
     JOIN codigos_articulos a ON a.id = i.articulo_id
     WHERE i.cuenta_id = $1
     ORDER BY i.created_at, i.id`,
    [cuentaId]
  );
  return { ...cuenta.rows[0], items: items.rows };
};

// Ejecuta un cambio sobre una cuenta abierta y responde con la cuenta actualizada.
const withCuenta = (fallback, change) => async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const cuenta = await lockCuentaAbierta(client, req.params.id);
    const status = await change(client, cuenta, req);
    await touchCuenta(client, cuenta.id);
    const detalle = await getCuentaDetalle(client, cuenta.id);
    await client.query('COMMIT');
    res.status(status || 200).json({ success: true, cuenta: detalle });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, fallback);
  } finally {
    if (client) client.release();
  }
};

const getCatalogo = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, codigo, nombre_articulo AS nombre, categoria AS seccion, familia, subfamilia,
              COALESCE(precio_unitario, 0) AS precio, COALESCE(cantidad_disponible, 0) AS stock,
              ${FOTO_VERSION_COLUMN}
       FROM codigos_articulos
       WHERE COALESCE(activo, true) = true
       ORDER BY categoria NULLS LAST, familia NULLS LAST, nombre_articulo`
    );
    res.status(200).json({ success: true, articulos: result.rows });
  } catch (error) {
    sendError(res, error, 'Error obteniendo el catálogo');
  }
};

const getCuentas = async (req, res) => {
  try {
    const result = await pool.query(
      `${CUENTA_SELECT} WHERE c.estado = 'abierta' GROUP BY c.id ORDER BY c.created_at`
    );
    res.status(200).json({ success: true, cuentas: result.rows });
  } catch (error) {
    sendError(res, error, 'Error obteniendo las cuentas abiertas');
  }
};

const getCuenta = async (req, res) => {
  try {
    const cuenta = await getCuentaDetalle(pool, req.params.id);
    if (!cuenta) return res.status(404).json({ error: 'La cuenta ya no existe; elige otra de la lista' });
    res.status(200).json({ success: true, cuenta });
  } catch (error) {
    sendError(res, error, 'Error obteniendo la cuenta');
  }
};

const createCuenta = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ');
    if (!nombre) throw httpError(400, 'Escribe un nombre para la cuenta, por ejemplo el del cliente');
    if (nombre.length > 80) throw httpError(400, 'El nombre de la cuenta admite hasta 80 caracteres');
    const result = await pool.query(
      `INSERT INTO pos_cuentas (id, nombre, abierta_por, abierta_por_nombre)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [generateId('CTA'), nombre, req.user.id, userName(req.user)]
    );
    const cuenta = await getCuentaDetalle(pool, result.rows[0].id);
    res.status(201).json({ success: true, cuenta });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya hay una cuenta abierta con ese nombre; ábrela desde la lista o usa otro nombre' });
    }
    sendError(res, error, 'Error abriendo la cuenta');
  }
};

const addItem = withCuenta('Error agregando el producto', async (client, cuenta, req) => {
  const cantidad = Number(req.body.cantidad ?? 1);
  if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > MAX_CANTIDAD) {
    throw httpError(400, `La cantidad debe ser un número entero entre 1 y ${MAX_CANTIDAD}`);
  }
  const nota = String(req.body.nota || '').trim().slice(0, 120);
  const articulo = await client.query(
    'SELECT id, COALESCE(precio_unitario, 0) AS precio FROM codigos_articulos WHERE id = $1 AND COALESCE(activo, true) = true',
    [String(req.body.articulo_id || '')]
  );
  if (!articulo.rows[0]) throw httpError(400, 'El producto ya no está disponible; actualiza el catálogo');

  // Si dos toques llegan a la vez, la base suma ambos sobre la misma línea.
  await client.query(
    `INSERT INTO pos_cuenta_items
     (id, cuenta_id, articulo_id, cantidad, precio_unitario, nota, user_id, usuario_nombre)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (cuenta_id, articulo_id, nota, user_id)
     DO UPDATE SET cantidad = LEAST(pos_cuenta_items.cantidad + EXCLUDED.cantidad, ${MAX_CANTIDAD}),
                   updated_at = NOW()`,
    [generateId('CTI'), cuenta.id, articulo.rows[0].id, cantidad, articulo.rows[0].precio,
      nota, req.user.id, userName(req.user)]
  );
  return 201;
});

// Suma o resta unidades a una línea; en 0 la línea se quita.
const changeItem = withCuenta('Error cambiando la cantidad', async (client, cuenta, req) => {
  const delta = Number(req.body.delta);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_CANTIDAD) {
    throw httpError(400, 'Indica cuántas unidades sumar o quitar');
  }
  const result = await client.query(
    `UPDATE pos_cuenta_items SET cantidad = LEAST(cantidad + $1, ${MAX_CANTIDAD}), updated_at = NOW()
     WHERE id = $2 AND cuenta_id = $3 AND cantidad + $1 > 0
     RETURNING id`,
    [delta, req.params.itemId, cuenta.id]
  );
  if (!result.rows[0]) {
    await client.query('DELETE FROM pos_cuenta_items WHERE id = $1 AND cuenta_id = $2', [req.params.itemId, cuenta.id]);
  }
});

const removeItem = withCuenta('Error quitando el producto', async (client, cuenta, req) => {
  await client.query('DELETE FROM pos_cuenta_items WHERE id = $1 AND cuenta_id = $2', [req.params.itemId, cuenta.id]);
});

const renameCuenta = withCuenta('Error renombrando la cuenta', async (client, cuenta, req) => {
  const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ');
  if (!nombre || nombre.length > 80) throw httpError(400, 'Escribe un nombre de hasta 80 caracteres');
  try {
    await client.query('UPDATE pos_cuentas SET nombre = $1 WHERE id = $2', [nombre, cuenta.id]);
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'Ya hay una cuenta abierta con ese nombre');
    throw error;
  }
});

const cobrarCuenta = async (req, res) => {
  let client;
  try {
    const metodoPago = String(req.body.metodo_pago || 'efectivo').toLowerCase();
    if (!METODOS_COBRO.has(metodoPago)) throw httpError(400, 'Elige efectivo, tarjeta o transferencia');
    // Factura: se revisan configuración y NIT antes de cobrar, para no registrar la venta con datos malos.
    const conFactura = req.body.comprobante === 'factura';
    if (conFactura) await prepararFactura(req.body.receptor);

    client = await pool.connect();
    await client.query('BEGIN');
    const cuenta = await lockCuentaAbierta(client, req.params.id);
    // Las líneas de distintos usuarios se agrupan por producto y precio en la venta.
    const lineas = await client.query(
      `SELECT articulo_id, precio_unitario, SUM(cantidad)::INTEGER AS cantidad
       FROM pos_cuenta_items WHERE cuenta_id = $1
       GROUP BY articulo_id, precio_unitario ORDER BY MIN(created_at)`,
      [cuenta.id]
    );
    if (lineas.rows.length === 0) throw httpError(400, 'La cuenta está vacía; agrega productos antes de cobrar');

    const venta = await registrarVenta(client, {
      // Fecha local de la caja, igual que en Ventas.
      fecha: req.body.fecha || new Date().toISOString().slice(0, 10),
      metodo_pago: metodoPago,
      cliente_id: req.body.cliente_id || null,
      observaciones: `Punto de venta · ${cuenta.nombre}`,
      items: lineas.rows.map((linea) => ({
        tipo: 'articulo',
        concepto_id: linea.articulo_id,
        cantidad: linea.cantidad,
        precio_unitario: Number(linea.precio_unitario)
      }))
    }, req.user.id);

    await client.query(
      `UPDATE pos_cuentas SET estado = 'cobrada', venta_id = $1, closed_at = NOW(),
       version = version + 1, updated_at = NOW() WHERE id = $2`,
      [venta.id, cuenta.id]
    );
    await client.query('COMMIT');
    client.release();
    client = null;

    // La venta ya quedó cobrada; si la certificación falla, la factura queda pendiente de reintento.
    let factura = null;
    if (conFactura) {
      try {
        factura = await emitirFactura(venta.id, req.body.receptor, req.user.id);
      } catch (error) {
        factura = { estado: 'error', error: error.expose ? error.message : 'No se pudo emitir la factura' };
      }
    }
    res.status(200).json({ success: true, venta, factura });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error cobrando la cuenta');
  } finally {
    if (client) client.release();
  }
};

const anularCuenta = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const cuenta = await lockCuentaAbierta(client, req.params.id);
    await client.query(
      `UPDATE pos_cuentas SET estado = 'anulada', closed_at = NOW(),
       version = version + 1, updated_at = NOW() WHERE id = $1`,
      [cuenta.id]
    );
    await client.query('COMMIT');
    res.status(200).json({ success: true, message: `Cuenta «${cuenta.nombre}» anulada` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    sendError(res, error, 'Error anulando la cuenta');
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getCatalogo,
  getCuentas,
  getCuenta,
  createCuenta,
  addItem,
  changeItem,
  removeItem,
  renameCuenta,
  cobrarCuenta,
  anularCuenta
};
