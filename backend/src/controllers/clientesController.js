const pool = require('../db/connection');
const { text, bool, runImport, rowError } = require('../utils/bulkImport');

const CLIENT_COLUMNS = `
  id, nombre, email, telefono, razon_social, nit, contacto_principal,
  direccion, activo, created_at, updated_at
`;

const newId = () => `CLI-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const normalize = (body) => ({
  nombre: text(body.nombre),
  email: text(body.email)?.toLowerCase() || null,
  telefono: text(body.telefono),
  razon_social: text(body.razon_social),
  nit: text(body.nit),
  contacto_principal: text(body.contacto_principal),
  direccion: text(body.direccion)
});

const getClientes = async (req, res) => {
  try {
    const { activo, search } = req.query;
    const params = [];
    let query = `SELECT ${CLIENT_COLUMNS} FROM clientes WHERE 1=1`;

    if (activo !== undefined) {
      params.push(activo === 'true');
      query += ` AND activo = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (nombre ILIKE $${params.length} OR nit ILIKE $${params.length}
                 OR email ILIKE $${params.length} OR telefono ILIKE $${params.length})`;
    }
    query += ' ORDER BY nombre ASC';

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, total: result.rows.length, clientes: result.rows });
  } catch (error) {
    console.error('Error en getClientes:', error);
    res.status(500).json({ error: 'Error obteniendo clientes' });
  }
};

const getClienteById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${CLIENT_COLUMNS} FROM clientes WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.status(200).json({ success: true, cliente: result.rows[0] });
  } catch (error) {
    console.error('Error en getClienteById:', error);
    res.status(500).json({ error: 'Error obteniendo cliente' });
  }
};

const createCliente = async (req, res) => {
  try {
    const data = normalize(req.body);
    if (!data.nombre) return res.status(400).json({ error: 'El nombre del cliente es requerido' });

    const duplicate = await pool.query(
      'SELECT id FROM clientes WHERE (nit IS NOT NULL AND nit = $1) OR (email IS NOT NULL AND email = $2)',
      [data.nit, data.email]
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese NIT o correo' });
    }

    const result = await pool.query(
      `INSERT INTO clientes
       (id, nombre, email, telefono, razon_social, nit, contacto_principal, direccion, activo,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING ${CLIENT_COLUMNS}`,
      [newId(), data.nombre, data.email, data.telefono, data.razon_social, data.nit,
        data.contacto_principal, data.direccion, bool(req.body.activo)]
    );
    res.status(201).json({ success: true, message: 'Cliente creado exitosamente', cliente: result.rows[0] });
  } catch (error) {
    console.error('Error en createCliente:', error);
    res.status(500).json({ error: 'Error creando cliente' });
  }
};

const updateCliente = async (req, res) => {
  try {
    const data = normalize(req.body);
    if (!data.nombre) return res.status(400).json({ error: 'El nombre del cliente es requerido' });

    const duplicate = await pool.query(
      `SELECT id FROM clientes
       WHERE id <> $3 AND ((nit IS NOT NULL AND nit = $1) OR (email IS NOT NULL AND email = $2))`,
      [data.nit, data.email, req.params.id]
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe otro cliente con ese NIT o correo' });
    }

    const result = await pool.query(
      `UPDATE clientes
       SET nombre = $1, email = $2, telefono = $3, razon_social = $4, nit = $5,
           contacto_principal = $6, direccion = $7, activo = $8, updated_at = NOW()
       WHERE id = $9
       RETURNING ${CLIENT_COLUMNS}`,
      [data.nombre, data.email, data.telefono, data.razon_social, data.nit,
        data.contacto_principal, data.direccion, bool(req.body.activo), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.status(200).json({ success: true, message: 'Cliente actualizado', cliente: result.rows[0] });
  } catch (error) {
    console.error('Error en updateCliente:', error);
    res.status(500).json({ error: 'Error actualizando cliente' });
  }
};

// Baja lógica para conservar el historial de ventas y cobros.
const deleteCliente = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE clientes SET activo = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.status(200).json({ success: true, message: 'Cliente dado de baja' });
  } catch (error) {
    console.error('Error en deleteCliente:', error);
    res.status(500).json({ error: 'Error dando de baja al cliente' });
  }
};

const importClientes = async (req, res) => {
  try {
    const summary = await runImport(pool, req.body.rows, async (client, raw) => {
      const data = normalize(raw);
      if (!data.nombre) throw rowError('El nombre es requerido');

      const existing = await client.query(
        `SELECT id FROM clientes
         WHERE ($1::text IS NOT NULL AND nit = $1) OR ($2::text IS NOT NULL AND email = $2)
         LIMIT 1`,
        [data.nit, data.email]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE clientes
           SET nombre = $1, email = COALESCE($2, email), telefono = COALESCE($3, telefono),
               razon_social = COALESCE($4, razon_social), nit = COALESCE($5, nit),
               contacto_principal = COALESCE($6, contacto_principal),
               direccion = COALESCE($7, direccion), updated_at = NOW()
           WHERE id = $8`,
          [data.nombre, data.email, data.telefono, data.razon_social, data.nit,
            data.contacto_principal, data.direccion, existing.rows[0].id]
        );
        return 'updated';
      }

      await client.query(
        `INSERT INTO clientes
         (id, nombre, email, telefono, razon_social, nit, contacto_principal, direccion, activo,
          created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())`,
        [newId(), data.nombre, data.email, data.telefono, data.razon_social, data.nit,
          data.contacto_principal, data.direccion]
      );
      return 'created';
    }, { dryRun: req.body.dryRun === true });

    res.status(200).json({ success: true, dryRun: req.body.dryRun === true, ...summary });
  } catch (error) {
    console.error('Error en importClientes:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error importando clientes' });
  }
};

module.exports = {
  getClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  importClientes
};
