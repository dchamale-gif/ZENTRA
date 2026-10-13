const db = require('../db/connection');
const { generateId } = require('../utils/helpers');

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
        pacienteId: row.paciente_id,
        paciente: row.paciente_nombre
            ? `${row.paciente_nombre} ${row.apellido_paterno || ''}`.trim()
            : null,
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
            const { tipo, desde, hasta, paciente_id, q } = req.query;
            const values = [];
            const conditions = ["COALESCE(c.estado, 'activo') = 'activo'"];
            const addCondition = (sql, value) => {
                values.push(value);
                conditions.push(sql.replace('?', `$${values.length}`));
            };

            if (tipo && tipo !== 'todos') addCondition('c.tipo_movimiento = ?', tipo);
            if (desde) addCondition('c.fecha >= ?', desde);
            if (hasta) addCondition('c.fecha <= ?', hasta);
            if (paciente_id) addCondition('c.paciente_id = ?', paciente_id);
            if (q) {
                values.push(q);
                const placeholder = `$${values.length}`;
                conditions.push(`(
                    c.descripcion ILIKE '%' || ${placeholder} || '%'
                    OR c.concepto ILIKE '%' || ${placeholder} || '%'
                    OR c.referencia ILIKE '%' || ${placeholder} || '%'
                    OR p.nombre ILIKE '%' || ${placeholder} || '%'
                    OR p.apellido_paterno ILIKE '%' || ${placeholder} || '%'
                )`);
            }

            const result = await db.query(`
                SELECT c.*, p.nombre AS paciente_nombre, p.apellido_paterno,
                    u.nombre AS usuario_nombre
                FROM caja c
                LEFT JOIN pacientes p ON p.id = c.paciente_id
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
            const { tipo, pacienteId, paciente_id, monto, descripcion, fecha, hora, referencia } = req.body;
            const amount = Number(monto);
            if (!tipo || !descripcion?.trim() || !fecha || !Number.isFinite(amount) || amount <= 0) {
                return res.status(400).json({ success: false, message: 'Tipo, descripción, fecha y monto positivo son obligatorios' });
            }

            await client.query('BEGIN');
            await client.query('LOCK TABLE caja IN SHARE ROW EXCLUSIVE MODE');
            const patientId = pacienteId || paciente_id || null;
            if (patientId) {
                const patient = await client.query('SELECT id FROM pacientes WHERE id = $1', [patientId]);
                if (patient.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'El paciente seleccionado no existe' });
                }
            }
            const balanceResult = await client.query(`
                SELECT saldo_posterior FROM caja
                WHERE COALESCE(estado, 'activo') = 'activo'
                ORDER BY created_at DESC LIMIT 1
            `);
            const previousBalance = Number(balanceResult.rows[0]?.saldo_posterior || 0);
            const direction = OUTPUT_TYPES.has(tipo) ? 'salida' : (tipo === 'Transferencia' ? 'transferencia' : 'entrada');
            const delta = direction === 'entrada' ? amount : (direction === 'salida' ? -amount : 0);
            const id = generateId('CAJ');
            const userId = Number.isInteger(Number(req.user?.id)) ? Number(req.user.id) : null;

            const result = await client.query(`
                INSERT INTO caja (
                    id, tipo, tipo_movimiento, concepto, categoria, monto, descripcion,
                    paciente_id, referencia, user_id, fecha, hora,
                    saldo_anterior, saldo_posterior, estado
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::time, CURRENT_TIME), $13, $14, 'activo')
                RETURNING *
            `, [
                id, direction, tipo, descripcion.trim().slice(0, 150), tipo, amount,
                descripcion.trim(), patientId, referencia || null,
                userId, fecha, hora || null, previousBalance, previousBalance + delta
            ]);
            await client.query('COMMIT');

            res.status(201).json({ success: true, message: 'Movimiento registrado', data: mapMovimiento(result.rows[0]) });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error registrando movimiento de caja:', error);
            res.status(500).json({ success: false, message: 'Error al registrar el movimiento', error: error.message });
        } finally {
            client.release();
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