const pool = require('../db/connection');
const { registrarMovimientoCaja } = require('../utils/cajaLedger');
const { parseFotoBase64 } = require('../utils/fotos');
const { generateId } = require('../utils/helpers');

// Depósitos del efectivo de la caja al banco. Quien maneja la caja los registra (sale el
// dinero de la caja) y un administrador los confirma al verlos en el banco o los rechaza
// (se anula el egreso y el dinero vuelve a contar en la caja).

const MAX_MONTO = 99999999.99;
const ESTADOS = new Set(['pendiente', 'confirmado', 'rechazado']);

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (res, error, fallback) => {
  if (!error.expose) console.error(fallback, error);
  res.status(error.status || 500).json({ success: false, error: error.expose ? error.message : fallback });
};

const text = (value, max) => String(value ?? '').trim().slice(0, max);

const COLUMNAS = `d.id, d.fecha, d.monto, d.cuenta_bancaria, d.numero_boleta, d.nota, d.estado,
  d.boleta_datos IS NOT NULL AS tiene_boleta, d.created_at, d.revisado_at, d.motivo_rechazo,
  TRIM(CONCAT(r.nombre, ' ', r.apellido)) AS registrado_por, TRIM(CONCAT(v.nombre, ' ', v.apellido)) AS revisado_por`;

const mapDeposito = (row) => ({
  id: row.id,
  fecha: row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : String(row.fecha).slice(0, 10),
  monto: Number(row.monto),
  cuentaBancaria: row.cuenta_bancaria,
  numeroBoleta: row.numero_boleta,
  nota: row.nota,
  estado: row.estado,
  tieneBoleta: row.tiene_boleta,
  registradoPor: row.registrado_por || null,
  registradoAt: row.created_at,
  revisadoPor: row.revisado_por || null,
  revisadoAt: row.revisado_at,
  motivoRechazo: row.motivo_rechazo
});

const buscar = (db, id) => db.query(
  `SELECT ${COLUMNAS} FROM depositos_caja d
   LEFT JOIN users r ON r.id = d.registrado_por
   LEFT JOIN users v ON v.id = d.revisado_por
   WHERE d.id = $1`,
  [id]
).then((result) => result.rows[0]);

/** GET /api/caja/depositos?estado=pendiente */
const listar = async (req, res) => {
  try {
    const estado = ESTADOS.has(req.query.estado) ? req.query.estado : null;
    const [depositos, resumen, cuentas] = await Promise.all([
      pool.query(
        `SELECT ${COLUMNAS} FROM depositos_caja d
         LEFT JOIN users r ON r.id = d.registrado_por
         LEFT JOIN users v ON v.id = d.revisado_por
         WHERE ($1::text IS NULL OR d.estado = $1)
         ORDER BY d.estado = 'pendiente' DESC, d.fecha DESC, d.created_at DESC
         LIMIT 200`,
        [estado]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS pendientes, COALESCE(SUM(monto), 0) AS monto_pendiente
         FROM depositos_caja WHERE estado = 'pendiente'`
      ),
      // Cuentas ya usadas, para sugerirlas al registrar el siguiente depósito.
      pool.query(
        `SELECT cuenta_bancaria FROM depositos_caja
         GROUP BY cuenta_bancaria ORDER BY MAX(created_at) DESC LIMIT 20`
      )
    ]);
    res.json({
      success: true,
      depositos: depositos.rows.map(mapDeposito),
      resumen: {
        pendientes: resumen.rows[0].pendientes,
        montoPendiente: Number(resumen.rows[0].monto_pendiente)
      },
      cuentas: cuentas.rows.map((row) => row.cuenta_bancaria)
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo los depósitos');
  }
};

/** GET /api/caja/depositos/:id/boleta */
const verBoleta = async (req, res) => {
  try {
    const result = await pool.query('SELECT boleta_mime, boleta_datos FROM depositos_caja WHERE id = $1', [req.params.id]);
    const row = result.rows[0];
    if (!row?.boleta_datos) throw httpError(404, 'El depósito no tiene foto de la boleta');
    res.set({ 'Content-Type': row.boleta_mime, 'Cache-Control': 'private, no-cache' });
    res.status(200).send(row.boleta_datos);
  } catch (error) {
    sendError(res, error, 'Error obteniendo la boleta');
  }
};

/** POST /api/caja/depositos { fecha, monto, cuentaBancaria, numeroBoleta, nota?, boleta? (base64) } */
const registrar = async (req, res) => {
  let client;
  try {
    const monto = Math.round(Number(req.body.monto) * 100) / 100;
    const fecha = text(req.body.fecha, 10);
    const cuenta = text(req.body.cuentaBancaria, 120);
    const boletaNumero = text(req.body.numeroBoleta, 60);
    const nota = text(req.body.nota, 500) || null;
    if (!Number.isFinite(monto) || monto <= 0 || monto > MAX_MONTO) throw httpError(400, 'Escribe el monto depositado, mayor que 0');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw httpError(400, 'Elige la fecha del depósito');
    if (!cuenta) throw httpError(400, 'Escribe la cuenta bancaria, por ejemplo «Industrial 123-456789-0»');
    if (!boletaNumero) throw httpError(400, 'Escribe el número de la boleta de depósito');
    const foto = req.body.boleta ? parseFotoBase64(req.body.boleta) : null;

    client = await pool.connect();
    await client.query('BEGIN');
    const repetida = await client.query(
      `SELECT 1 FROM depositos_caja WHERE cuenta_bancaria = $1 AND numero_boleta = $2 AND estado <> 'rechazado'`,
      [cuenta, boletaNumero]
    );
    if (repetida.rows.length) throw httpError(409, `La boleta ${boletaNumero} ya está registrada en esa cuenta`);

    const userId = Number.isInteger(Number(req.user?.id)) ? Number(req.user.id) : null;
    const movimiento = await registrarMovimientoCaja(client, {
      direccion: 'salida',
      tipoMovimiento: 'Depósito bancario',
      monto,
      descripcion: `Depósito a ${cuenta} · boleta ${boletaNumero}`,
      fecha,
      referencia: boletaNumero.slice(0, 100),
      userId
    });
    // No se puede depositar más efectivo del que hay en la caja.
    const enCaja = Number(movimiento.saldo_anterior);
    if (monto > enCaja + 0.004) {
      throw httpError(400, `En la caja hay Q${enCaja.toFixed(2)}; el depósito no puede ser mayor`);
    }

    const id = generateId('DEP');
    await client.query(
      `INSERT INTO depositos_caja
       (id, fecha, monto, cuenta_bancaria, numero_boleta, nota, boleta_mime, boleta_datos, caja_movimiento_id, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, fecha, monto, cuenta, boletaNumero, nota, foto?.mime || null, foto?.buffer || null, movimiento.id, userId]
    );
    await client.query('COMMIT');
    client.release();
    client = null;

    res.status(201).json({
      success: true,
      message: 'Depósito registrado. Salió de la caja y queda pendiente de que un administrador lo confirme.',
      deposito: mapDeposito(await buscar(pool, id))
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (error.code === '23505') return sendError(res, httpError(409, 'Esa boleta ya está registrada en esa cuenta'), '');
    sendError(res, error, 'Error registrando el depósito');
  }
};

// Solo un depósito pendiente se revisa; dos administradores a la vez no lo revisan dos veces.
const revisar = async (req, res, estado) => {
  let client;
  try {
    const motivo = estado === 'rechazado' ? text(req.body.motivo, 500) : null;
    if (estado === 'rechazado' && !motivo) throw httpError(400, 'Escribe por qué se rechaza, por ejemplo «no aparece en el banco»');

    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE depositos_caja SET estado = $2, revisado_por = $3, revisado_at = NOW(), motivo_rechazo = $4
       WHERE id = $1 AND estado = 'pendiente'
       RETURNING caja_movimiento_id`,
      [req.params.id, estado, req.user.id, motivo]
    );
    if (!result.rows.length) {
      const existe = await client.query('SELECT estado FROM depositos_caja WHERE id = $1', [req.params.id]);
      throw existe.rows.length
        ? httpError(409, `Este depósito ya está ${existe.rows[0].estado}`)
        : httpError(404, 'Depósito no encontrado');
    }
    if (estado === 'rechazado' && result.rows[0].caja_movimiento_id) {
      await client.query(
        `UPDATE caja SET estado = 'anulado', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [result.rows[0].caja_movimiento_id]
      );
    }
    await client.query('COMMIT');
    client.release();
    client = null;

    res.json({
      success: true,
      message: estado === 'confirmado'
        ? 'Depósito confirmado.'
        : 'Depósito rechazado. El monto vuelve a contar en la caja.',
      deposito: mapDeposito(await buscar(pool, req.params.id))
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    sendError(res, error, 'Error revisando el depósito');
  }
};

const confirmar = (req, res) => revisar(req, res, 'confirmado');
const rechazar = (req, res) => revisar(req, res, 'rechazado');

module.exports = { listar, verBoleta, registrar, confirmar, rechazar };
