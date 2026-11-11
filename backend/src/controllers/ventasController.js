const pool = require('../db/connection');
const authPool = require('../db/authConnection');
const { dbInputErrorMessage } = require('../utils/inventory');
const { registrarMovimientoCaja, anularMovimientosDeVenta } = require('../utils/cajaLedger');

const METODOS_CONTADO = ['efectivo', 'tarjeta', 'transferencia'];
// Venta pagada con varias formas a la vez (por ejemplo, parte en efectivo y el resto con tarjeta).
const METODO_DIVIDIDO = 'mixto';
const METODOS_PAGO = new Set([...METODOS_CONTADO, 'credito', METODO_DIVIDIDO]);
// Sufijo del id de cada parte del pago de contado (el id admite 50 caracteres).
const SUFIJO_PAGO = { efectivo: 'EF', tarjeta: 'TA', transferencia: 'TR' };

const VENTA_SELECT = `
  SELECT v.id, v.numero_venta, v.cliente_id, v.user_id,
         v.fecha, v.hora, v.subtotal, v.descuento, v.descuento_general, v.impuesto, v.total,
         v.metodo_pago, v.estado, v.observaciones, v.created_at, v.updated_at,
         v.factura_solicitada, v.factura_receptor_id, v.factura_receptor_tipo, v.factura_receptor_nombre,
         v.factura_externa, v.factura_externa_at,
         COALESCE(c.nombre, 'Consumidor final') AS receptor_nombre,
         CASE WHEN v.cliente_id IS NOT NULL THEN 'cliente' ELSE 'consumidor' END AS receptor_tipo,
         c.nit AS cliente_nit, c.dpi AS cliente_dpi, c.telefono AS cliente_telefono,
         c.direccion AS cliente_direccion,
         (SELECT pc.nombre FROM pos_cuentas pc WHERE pc.venta_id = v.id LIMIT 1) AS cuenta_nombre,
         COALESCE(pg.pagado, 0) AS pagado,
         (SELECT COALESCE(json_agg(json_build_object('metodo', p.metodo_pago, 'monto', p.monto)
                  ORDER BY p.created_at, p.id), '[]'::json)
          FROM pagos_factura p WHERE p.venta_id = v.id AND p.origen = 'contado') AS pagos_contado,
         (SELECT row_to_json(f) FROM (
            SELECT id, estado, tipo_dte, serie, numero, uuid, receptor_id, receptor_nombre, error, ambiente,
                   fecha_certificacion
            FROM fel_documentos WHERE venta_id = v.id ORDER BY created_at DESC LIMIT 1) f) AS factura,
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
               'descuento', vi.descuento,
               'descuento_general', vi.descuento_general,
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
const VENTA_GROUP_BY = 'GROUP BY v.id, c.id, pg.pagado';

// Los usuarios viven en la base de autenticación: el nombre de quien vendió se agrega aparte.
const agregarVendedores = async (ventas, organizationId) => {
  const ids = [...new Set(ventas.map((venta) => venta.user_id).filter(Boolean))];
  if (!ids.length) return ventas;
  try {
    const result = await authPool.query(
      'SELECT id, nombre, apellido, email FROM users WHERE id = ANY($1::int[]) AND organization_id = $2',
      [ids, organizationId]
    );
    const nombres = new Map(result.rows.map((user) => [
      user.id,
      // Los usuarios dados de baja conservan su nombre; su correo se reemplazó por «baja-…».
      [user.nombre, user.apellido].filter(Boolean).join(' ') || (user.email.startsWith('baja-') ? null : user.email)
    ]));
    return ventas.map((venta) => ({ ...venta, vendedor_nombre: nombres.get(venta.user_id) || null }));
  } catch (error) {
    // El nombre de quien vendió es un dato de cortesía: sin él la lista sigue sirviendo.
    console.error('No se pudieron leer los vendedores:', error.message);
    return ventas;
  }
};

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
    const descuento = Number(item.descuento || 0);
    const brutoCent = Math.round(cantidad * precioUnitario * 100);
    const descuentoCent = Math.round(descuento * 100);
    if (!Number.isFinite(descuento) || descuento < 0) {
      throw httpError(400, `Línea ${index + 1}: el descuento no es válido`);
    }
    if (descuentoCent > brutoCent) {
      throw httpError(400, `Línea ${index + 1}: el descuento no puede ser mayor que el importe de la línea`);
    }
    return {
      tipo,
      conceptoId,
      cantidad,
      precioUnitario,
      brutoCent,
      descuentoCent,
      // Neto de la línea; importesVenta le resta su parte del descuento al total.
      subtotal: (brutoCent - descuentoCent) / 100
    };
  });
};

// Importes de la venta en centavos: bruto, descuentos por línea y descuento al total. El
// descuento al total se reparte entre las líneas en proporción a su neto (los centavos que
// sobran del reparto van a las líneas con mayor fracción), así la factura electrónica, que
// solo admite descuento por línea, y los reportes por producto cuadran con el total.
const importesVenta = (body) => {
  const items = normalizeItems(body.items);
  const generalInput = Number(body.descuento_general || 0);
  if (!Number.isFinite(generalInput) || generalInput < 0) throw httpError(400, 'El descuento al total no es válido');
  const general = Math.round(generalInput * 100);
  const netos = items.map((item) => item.brutoCent - item.descuentoCent);
  const sumaNetos = netos.reduce((sum, neto) => sum + neto, 0);
  if (general > sumaNetos) {
    throw httpError(400, `El descuento al total (Q${(general / 100).toFixed(2)}) es mayor que lo que suma la venta (Q${(sumaNetos / 100).toFixed(2)})`);
  }
  const exactas = netos.map((neto) => (sumaNetos ? (general * neto) / sumaNetos : 0));
  const partes = exactas.map(Math.floor);
  let resto = general - partes.reduce((sum, parte) => sum + parte, 0);
  const orden = exactas.map((exacta, index) => ({ index, fraccion: exacta - partes[index] }))
    .sort((a, b) => b.fraccion - a.fraccion);
  for (const { index } of orden) {
    if (resto <= 0) break;
    if (partes[index] < netos[index]) {
      partes[index] += 1;
      resto -= 1;
    }
  }
  items.forEach((item, index) => {
    item.descuento = item.descuentoCent / 100;
    item.descuentoGeneral = partes[index] / 100;
    item.subtotal = (netos[index] - partes[index]) / 100;
  });
  const bruto = items.reduce((sum, item) => sum + item.brutoCent, 0);
  const descuentoLineas = items.reduce((sum, item) => sum + item.descuentoCent, 0);
  return {
    items,
    subtotal: bruto / 100,
    descuentoGeneral: general / 100,
    descuento: (descuentoLineas + general) / 100,
    total: (sumaNetos - general) / 100
  };
};

// Dar descuentos requiere el módulo Descuentos. Al editar una venta que ya tenía descuento,
// quien no tiene el permiso puede guardarla si deja el mismo descuento.
const assertPuedeDescontar = (importes, puedeDescontar, descuentoAnterior = 0) => {
  if (puedeDescontar || importes.descuento === 0) return;
  if (Math.round(importes.descuento * 100) === Math.round(Number(descuentoAnterior) * 100)) return;
  throw httpError(403, 'No tienes permiso para dar descuentos; pide al administrador el módulo «Descuentos al vender»');
};

const puedeDescontar = (req) => (req.userPermissions || []).includes('descuentos_edit');

// Pago dividido: [{ metodo, monto }] entre efectivo, tarjeta y transferencia. Se juntan los
// montos de una misma forma y se descartan los que vienen en cero. Los montos van en centavos
// para comparar con el total sin errores de redondeo.
const normalizePagos = (pagos) => {
  if (!Array.isArray(pagos)) throw httpError(400, 'Indica cuánto se paga con cada forma de pago');
  const porMetodo = new Map();
  for (const pago of pagos) {
    const metodo = String(pago?.metodo || '').toLowerCase();
    if (!METODOS_CONTADO.includes(metodo)) {
      throw httpError(400, 'Cada parte del pago debe ser en efectivo, tarjeta o transferencia');
    }
    const monto = Number(pago.monto);
    if (!Number.isFinite(monto) || monto < 0 || monto > 99999999.99) {
      throw httpError(400, 'Escribe montos válidos en el pago dividido, por ejemplo 150.50');
    }
    const centavos = Math.round(monto * 100);
    if (centavos > 0) porMetodo.set(metodo, (porMetodo.get(metodo) || 0) + centavos);
  }
  if (porMetodo.size === 0) throw httpError(400, 'Indica cuánto se paga con cada forma de pago');
  return METODOS_CONTADO.filter((metodo) => porMetodo.has(metodo))
    .map((metodo) => ({ metodo, centavos: porMetodo.get(metodo) }));
};

// Notas del comprobante: se imprimen en el ticket, la hoja y la factura electrónica.
const MAX_NOTAS = 500;
const normalizeNotas = (texto) => {
  const notas = String(texto ?? '').replace(/\r\n/g, '\n').trim();
  if (notas.length > MAX_NOTAS) throw httpError(400, `Las notas admiten hasta ${MAX_NOTAS} caracteres`);
  return notas || null;
};

const normalizeHeader = (body) => {
  let metodoPago = String(body.metodo_pago || 'efectivo').toLowerCase();
  if (!METODOS_PAGO.has(metodoPago)) throw httpError(400, 'Método de pago no válido');
  if (!body.fecha) throw httpError(400, 'La fecha es requerida');
  const clienteId = body.cliente_id ? String(body.cliente_id) : null;
  if (metodoPago === 'credito' && !clienteId) {
    throw httpError(400, 'Las ventas al crédito requieren un cliente para poder cobrarlas después');
  }
  let pagos = null;
  if (metodoPago === METODO_DIVIDIDO) {
    pagos = normalizePagos(body.pagos);
    // Si todo quedó en una sola forma, la venta es de esa forma.
    if (pagos.length === 1) {
      metodoPago = pagos[0].metodo;
      pagos = null;
    }
  }
  return {
    clienteId,
    fecha: body.fecha,
    metodoPago,
    pagos,
    observaciones: normalizeNotas(body.observaciones)
  };
};

// Las partes del pago deben sumar exactamente el total de la venta.
const assertPagosCuadran = (pagos, total) => {
  if (!pagos) return;
  const suma = pagos.reduce((acc, pago) => acc + pago.centavos, 0);
  const esperado = Math.round(Number(total) * 100);
  if (suma !== esperado) {
    const q = (centavos) => `Q${(centavos / 100).toFixed(2)}`;
    throw httpError(400, suma < esperado
      ? `Los pagos suman ${q(suma)} y el total es ${q(esperado)}: faltan ${q(esperado - suma)}`
      : `Los pagos suman ${q(suma)} y el total es ${q(esperado)}: sobran ${q(suma - esperado)}`);
  }
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
       (id, venta_id, medicina_id, articulo_id, cantidad, precio_unitario, descuento, descuento_general, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [itemId, ventaId, item.tipo === 'medicina' ? item.conceptoId : null,
        item.tipo === 'articulo' ? item.conceptoId : null, item.cantidad,
        item.precioUnitario, item.descuento || 0, item.descuentoGeneral || 0, item.subtotal]
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

// Una venta con factura FEL vigente no se puede cambiar: primero hay que anular la factura.
const assertSinFacturaVigente = async (client, ventaId, accion) => {
  const result = await client.query(
    `SELECT serie, numero, estado FROM fel_documentos
     WHERE venta_id = $1 AND estado IN ('pendiente', 'certificado', 'anulado')
     ORDER BY created_at DESC`,
    [ventaId]
  );
  const vigente = result.rows.find((row) => row.estado !== 'anulado');
  if (vigente) {
    throw httpError(409, `La venta tiene la factura ${vigente.serie || ''}-${vigente.numero || ''} vigente; anúlala antes de ${accion}`);
  }
  // Las facturas anuladas se conservan como registro fiscal junto con su venta.
  if (accion === 'eliminarla' && result.rows.length) {
    throw httpError(409, 'La venta tiene facturas anuladas que deben conservarse; no se puede eliminar');
  }
};

// Una venta cuyo cobro ya entró en un cierre de caja aprobado no se puede cambiar: el cierre
// quedaría descuadrado.
const assertSinCierreCaja = async (client, ventaId, accion) => {
  const result = await client.query(
    `SELECT c.numero FROM pagos_factura p JOIN cierres_caja c ON c.id = p.cierre_id
     WHERE p.venta_id = $1 AND p.origen = 'contado' LIMIT 1`,
    [ventaId]
  );
  if (result.rows[0]) {
    throw httpError(409, `El cobro de esta venta ya está en el cierre de caja ${result.rows[0].numero}; no se puede ${accion === 'eliminarla' ? 'eliminar' : 'modificar'}`);
  }
};

// Abonos registrados en Cuentas por Cobrar (no incluye el pago automático de contado).
const getAbonos = async (client, ventaId) => {
  const result = await client.query(
    `SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_factura WHERE venta_id = $1 AND origen <> 'contado'`,
    [ventaId]
  );
  return Number(result.rows[0].total);
};

// Una venta de contado queda pagada al registrarse: un pago por cada forma usada (uno solo si
// no es pago dividido). Lo que se pagó en efectivo entra a caja.
// Una venta al crédito queda pendiente en Cuentas por Cobrar.
const aplicarPago = async (client, venta, userId, pagos = null) => {
  if (venta.metodo_pago === 'credito' || Number(venta.total) <= 0) return;
  const partes = pagos
    ? pagos.map((pago) => ({ metodo: pago.metodo, monto: pago.centavos / 100 }))
    : [{ metodo: venta.metodo_pago, monto: Number(venta.total) }];
  for (const parte of partes) {
    await client.query(
      `INSERT INTO pagos_factura (id, venta_id, monto, fecha, metodo_pago, observaciones, usuario_id, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'contado')`,
      [partes.length > 1 ? `PAG-CONT-${venta.id}-${SUFIJO_PAGO[parte.metodo]}` : `PAG-CONT-${venta.id}`,
        venta.id, parte.monto, venta.fecha, parte.metodo,
        partes.length > 1 ? 'Pago de contado (pago dividido)' : 'Pago de contado', userId]
    );
  }
  const efectivo = partes.find((parte) => parte.metodo === 'efectivo');
  if (efectivo) {
    await registrarMovimientoCaja(client, {
      direccion: 'entrada',
      tipoMovimiento: 'Ingreso por Venta',
      monto: efectivo.monto,
      descripcion: partes.length > 1 ? `Venta ${venta.numero_venta} (parte en efectivo)` : `Venta ${venta.numero_venta}`,
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

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Estado de la última factura de la venta, igual que la columna «Comprobante» de Ventas.
const ULTIMA_FACTURA = `COALESCE((SELECT estado FROM fel_documentos WHERE venta_id = v.id
  ORDER BY created_at DESC LIMIT 1), '')`;
const FACTURA_VIGENTE = `${ULTIMA_FACTURA} IN ('certificado', 'anulado', 'pendiente')`;
const FILTROS_COMPROBANTE = {
  factura: `(${ULTIMA_FACTURA} = 'certificado' OR (NOT ${FACTURA_VIGENTE} AND v.factura_externa IS NOT NULL))`,
  // Pedida al cobrar y aún sin emitir, o con un intento de emisión fallido.
  pendiente: `(NOT ${FACTURA_VIGENTE} AND v.factura_externa IS NULL
    AND (COALESCE(v.factura_solicitada, false) OR ${ULTIMA_FACTURA} = 'error'))`,
  anulada: `${ULTIMA_FACTURA} = 'anulado'`,
  ticket: `(${ULTIMA_FACTURA} = '' AND v.factura_externa IS NULL AND NOT COALESCE(v.factura_solicitada, false))`
};

// Filtros del historial: cliente, rango de fechas, tipo de comprobante y búsqueda por texto.
const filtrosVentas = (query) => {
  const params = [];
  const where = [];
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (query.cliente_id) where.push(`v.cliente_id = ${param(String(query.cliente_id))}`);
  for (const [campo, operador] of [['desde', '>='], ['hasta', '<=']]) {
    if (!query[campo]) continue;
    if (!FECHA_RE.test(query[campo]) || Number.isNaN(Date.parse(query[campo]))) {
      throw httpError(400, 'Usa fechas con el formato AAAA-MM-DD');
    }
    where.push(`v.fecha ${operador} ${param(query[campo])}::date`);
  }
  if (query.comprobante) {
    const filtro = FILTROS_COMPROBANTE[query.comprobante];
    if (!filtro) throw httpError(400, 'Tipo de comprobante no válido');
    where.push(filtro);
  }
  const texto = String(query.q || '').trim().slice(0, 100);
  if (texto) {
    // Sin comodines del usuario: «50%» busca el texto tal cual.
    const like = param(`%${texto.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    where.push(`(v.numero_venta ILIKE ${like} OR c.nombre ILIKE ${like} OR c.nit ILIKE ${like}
      OR v.factura_receptor_nombre ILIKE ${like} OR v.factura_receptor_id ILIKE ${like}
      OR v.factura_externa ILIKE ${like}
      OR EXISTS (SELECT 1 FROM fel_documentos fd WHERE fd.venta_id = v.id
                 AND (fd.receptor_nombre ILIKE ${like} OR fd.receptor_id ILIKE ${like}
                      OR fd.numero ILIKE ${like} OR fd.serie ILIKE ${like})))`);
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
};

const getVentas = async (req, res) => {
  try {
    const { where, params } = filtrosVentas(req.query);
    const result = await pool.query(
      `${VENTA_SELECT} ${where} ${VENTA_GROUP_BY}
       ORDER BY v.fecha DESC, v.created_at DESC`,
      params
    );
    const ventas = await agregarVendedores(result.rows, req.organization.id);
    res.status(200).json({ success: true, total: ventas.length, ventas });
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

// Registra la venta completa (existencias, correlativo, líneas y pago) dentro de la
// transacción del llamador. La usan Ventas y el cobro de cuentas del punto de venta.
const registrarVenta = async (client, body, userId, { puedeDescontar: conPermiso = false } = {}) => {
  const header = normalizeHeader(body);
  const importes = importesVenta(body);
  const { items } = importes;
  assertPuedeDescontar(importes, conPermiso);
  assertPagosCuadran(header.pagos, importes.total);

  await validateReceiver(client, header.clienteId);
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ventas_numero_correlativo'))");
  await validateAndDiscountStock(client, items);
  const numeroVenta = await getNextNumeroVenta(client);
  const ventaId = `VTA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const result = await client.query(
    `INSERT INTO ventas
     (id, numero_venta, cliente_id, user_id, fecha, hora, subtotal,
      descuento, descuento_general, impuesto, total, metodo_pago, estado, observaciones)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIME, $6, $7, $8, 0, $9, $10, 'completada', $11)
     RETURNING *`,
    [ventaId, numeroVenta, header.clienteId, userId, header.fecha, importes.subtotal,
      importes.descuento, importes.descuentoGeneral, importes.total, header.metodoPago, header.observaciones]
  );
  await insertItems(client, ventaId, items);
  await aplicarPago(client, { ...result.rows[0], fecha: header.fecha }, userId, header.pagos);
  return result.rows[0];
};

const createVenta = async (req, res) => {
  let client;
  try {
    // Validar antes de pedir conexión: los errores de datos no deben ocupar el pool.
    const header = normalizeHeader(req.body);
    const importes = importesVenta(req.body);
    assertPuedeDescontar(importes, puedeDescontar(req));
    assertPagosCuadran(header.pagos, importes.total);

    client = await pool.connect();
    await client.query('BEGIN');
    const venta = await registrarVenta(client, req.body, req.user.id, { puedeDescontar: puedeDescontar(req) });
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Venta creada exitosamente', venta });
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
    const importes = importesVenta(req.body);
    const { items, total } = importes;
    assertPagosCuadran(header.pagos, total);

    client = await pool.connect();
    await client.query('BEGIN');
    await validateReceiver(client, header.clienteId);
    const existing = await client.query('SELECT id, descuento FROM ventas WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (existing.rows.length === 0) throw httpError(404, 'Venta no encontrada');
    assertPuedeDescontar(importes, puedeDescontar(req), existing.rows[0].descuento);
    await assertSinFacturaVigente(client, req.params.id, 'modificarla');
    await assertSinCierreCaja(client, req.params.id, 'modificarla');

    const abonos = await getAbonos(client, req.params.id);
    if (abonos > 0 && header.metodoPago !== 'credito') {
      throw httpError(409, 'La venta ya tiene abonos en Cuentas por Cobrar; debe seguir siendo al crédito');
    }
    if (abonos > total + 0.005) {
      throw httpError(409, `El nuevo total (Q${total.toFixed(2)}) es menor a lo ya abonado (Q${abonos.toFixed(2)})`);
    }

    await revertirPago(client, req.params.id);
    await restoreStock(client, req.params.id);
    await validateAndDiscountStock(client, items);
    const result = await client.query(
      `UPDATE ventas SET cliente_id = $1, fecha = $2, subtotal = $3,
       descuento = $4, descuento_general = $5, impuesto = 0, total = $6, metodo_pago = $7, observaciones = $8,
       updated_at = NOW() WHERE id = $9 RETURNING *`,
      [header.clienteId, header.fecha, importes.subtotal, importes.descuento, importes.descuentoGeneral,
        total, header.metodoPago, header.observaciones, req.params.id]
    );
    await client.query('DELETE FROM venta_items WHERE venta_id = $1', [req.params.id]);
    await insertItems(client, req.params.id, items);
    await aplicarPago(client, { ...result.rows[0], fecha: header.fecha }, req.user.id, header.pagos);
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
    await assertSinFacturaVigente(client, req.params.id, 'eliminarla');
    await assertSinCierreCaja(client, req.params.id, 'eliminarla');
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

// Factura pendiente (el cliente la pidió sin facturación electrónica activa): se registra la
// serie y número de la factura emitida fuera del ERP. Con número vacío se vuelve a dejar pendiente.
const registrarFacturaExterna = async (req, res) => {
  try {
    const numero = String(req.body.numero || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const venta = await pool.query('SELECT factura_solicitada FROM ventas WHERE id = $1', [req.params.id]);
    if (!venta.rows[0]) throw httpError(404, 'Venta no encontrada');
    if (!venta.rows[0].factura_solicitada) throw httpError(400, 'Esta venta no tiene una factura pendiente');
    const fel = await pool.query(
      `SELECT 1 FROM fel_documentos WHERE venta_id = $1 AND estado IN ('certificado', 'pendiente') LIMIT 1`,
      [req.params.id]
    );
    if (fel.rows.length) throw httpError(409, 'La venta ya tiene una factura electrónica emitida desde el ERP');
    await pool.query(
      `UPDATE ventas SET factura_externa = $2, factura_externa_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END,
       updated_at = NOW() WHERE id = $1`,
      [req.params.id, numero || null]
    );
    res.status(200).json({
      success: true,
      message: numero ? `Factura ${numero} registrada` : 'La venta vuelve a quedar con factura pendiente'
    });
  } catch (error) {
    sendError(res, error, 'Error registrando la factura');
  }
};

module.exports = {
  getVentas, getReceptores, createVenta, updateVenta, deleteVenta, registrarFacturaExterna,
  registrarVenta, sendError, httpError
};
