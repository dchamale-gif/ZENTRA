const db = require('../db/connection');
const { registrarMovimientoCaja } = require('../utils/cajaLedger');

const OUTPUT_TYPES = new Set(['Egreso', 'Devolución']);

function mapMovimiento(row) {
    const legacyTypes = {
        entrada: 'Ingreso por Cobro',
        salida: 'Egreso',
        transferencia: 'Transferencia'
    };
    return {
        id: row.id,
        tipo: row.tipo_movimiento || row.categoria || legacyTypes[row.tipo] || row.tipo,
        direccion: row.tipo,
        clienteId: row.cliente_id,
        cliente: row.cliente_nombre || null,
        monto: Number(row.monto),
        descripcion: row.descripcion || row.concepto,
        fecha: row.fecha,
        hora: row.hora,
        referencia: row.referencia || '-',
        usuario: row.usuario_nombre || 'Sistema',
        saldoAnterior: Number(row.saldo_anterior || 0),
        saldoPosterior: Number(row.saldo_posterior || 0),
        estado: row.estado || 'activo'
    };
}

class CajaController {
    async getMovimientos(req, res) {
        try {
            const { tipo, desde, hasta, cliente_id, q } = req.query;
            const values = [];
            const conditions = ["COALESCE(c.estado, 'activo') = 'activo'"];
            const addCondition = (sql, value) => {
                values.push(value);
                conditions.push(sql.replace('?', `$${values.length}`));
            };

            if (tipo && tipo !== 'todos') addCondition('c.tipo_movimiento = ?', tipo);
            if (desde) addCondition('c.fecha >= ?', desde);
            if (hasta) addCondition('c.fecha <= ?', hasta);
            if (cliente_id) addCondition('c.cliente_id = ?', cliente_id);
            if (q) {
                values.push(q);
                const placeholder = `$${values.length}`;
                conditions.push(`(
                    c.descripcion ILIKE '%' || ${placeholder} || '%'
                    OR c.concepto ILIKE '%' || ${placeholder} || '%'
                    OR c.referencia ILIKE '%' || ${placeholder} || '%'
                    OR cl.nombre ILIKE '%' || ${placeholder} || '%'
                )`);
            }

            const result = await db.query(`
                SELECT c.*, cl.nombre AS cliente_nombre,
                    u.nombre AS usuario_nombre
                FROM caja c
                LEFT JOIN clientes cl ON cl.id = c.cliente_id
                LEFT JOIN users u ON u.id = c.user_id
                WHERE ${conditions.join(' AND ')}
                ORDER BY c.fecha DESC, c.hora DESC, c.created_at DESC
                LIMIT 500
            `, values);

            res.json({ success: true, data: result.rows.map(mapMovimiento) });
        } catch (error) {
            console.error('Error obteniendo movimientos de caja:', error);
            res.status(500).json({ success: false, message: 'Error al obtener movimientos de caja', error: error.message });
        }
    }

    async getResumen(req, res) {
        try {
            const { desde, hasta } = req.query;
            const result = await db.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN monto ELSE 0 END), 0) AS ingresos,
                    COALESCE(SUM(CASE WHEN tipo = 'salida' THEN monto ELSE 0 END), 0) AS egresos,
                    COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN monto WHEN tipo = 'salida' THEN -monto ELSE 0 END), 0) AS saldo
                FROM caja
                WHERE COALESCE(estado, 'activo') = 'activo'
                    AND ($1::date IS NULL OR fecha >= $1::date)
                    AND ($2::date IS NULL OR fecha <= $2::date)
            `, [desde || null, hasta || null]);
            const row = result.rows[0];
            res.json({
                success: true,
                data: {
                    ingresos: Number(row.ingresos),
                    egresos: Number(row.egresos),
                    saldo: Number(row.saldo)
                }
            });
        } catch (error) {
            console.error('Error obteniendo resumen de caja:', error);
            res.status(500).json({ success: false, message: 'Error al obtener el resumen de caja', error: error.message });
        }
    }

    async createMovimiento(req, res) {
        const client = await db.connect();
        try {
            const { tipo, clienteId, cliente_id, monto, descripcion, fecha, hora, referencia } = req.body;
            const amount = Number(monto);
            if (!tipo || !descripcion?.trim() || !fecha || !Number.isFinite(amount) || amount <= 0) {
                return res.status(400).json({ success: false, message: 'Tipo, descripción, fecha y monto positivo son obligatorios' });
            }

            await client.query('BEGIN');
            const customerId = clienteId || cliente_id || null;
            if (customerId) {
                const customer = await client.query('SELECT id FROM clientes WHERE id = $1', [customerId]);
                if (customer.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'El cliente seleccionado no existe' });
                }
            }
            const direccion = OUTPUT_TYPES.has(tipo) ? 'salida' : (tipo === 'Transferencia' ? 'transferencia' : 'entrada');
            const userId = Number.isInteger(Number(req.user?.id)) ? Number(req.user.id) : null;
            const movimiento = await registrarMovimientoCaja(client, {
                direccion,
                tipoMovimiento: tipo,
                monto: amount,
                descripcion: descripcion.trim(),
                fecha,
                hora: hora || null,
                clienteId: customerId,
                referencia: referencia || null,
                userId
            });
            await client.query('COMMIT');

            res.status(201).json({ success: true, message: 'Movimiento registrado', data: mapMovimiento(movimiento) });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error registrando movimiento de caja:', error);
            res.status(500).json({ success: false, message: 'Error al registrar el movimiento', error: error.message });
        } finally {
            client.release();
        }
    }

    // Los movimientos de caja no se borran: se anulan para conservar el historial.
    async anularMovimiento(req, res) {
        try {
            const linked = await db.query(
                `SELECT v.numero_venta FROM caja c JOIN ventas v ON v.id = c.referencia_venta_id WHERE c.id = $1`,
                [req.params.id]
            );
            if (linked.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `Este ingreso pertenece a la venta ${linked.rows[0].numero_venta}; edita o elimina la venta para cambiarlo.`
                });
            }
            const result = await db.query(`
                UPDATE caja
                SET estado = 'anulado', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND COALESCE(estado, 'activo') = 'activo'
                RETURNING *
            `, [req.params.id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Movimiento no encontrado o ya anulado' });
            }
            res.json({ success: true, message: 'Movimiento anulado', data: mapMovimiento(result.rows[0]) });
        } catch (error) {
            console.error('Error anulando movimiento de caja:', error);
            res.status(500).json({ success: false, message: 'Error al anular el movimiento', error: error.message });
        }
    }

    async updateMovimiento(req, res) {
        try {
            const { descripcion, referencia } = req.body;
            const result = await db.query(`
                UPDATE caja
                SET descripcion = COALESCE($1, descripcion),
                    concepto = COALESCE($1, concepto),
                    referencia = COALESCE($2, referencia),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3 AND COALESCE(estado, 'activo') = 'activo'
                RETURNING *
            `, [descripcion?.trim() || null, referencia?.trim() || null, req.params.id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Movimiento no encontrado' });
            }
            res.json({ success: true, message: 'Movimiento actualizado', data: mapMovimiento(result.rows[0]) });
        } catch (error) {
            console.error('Error actualizando movimiento de caja:', error);
            res.status(500).json({ success: false, message: 'Error al actualizar el movimiento', error: error.message });
        }
    }
}

module.exports = new CajaController();