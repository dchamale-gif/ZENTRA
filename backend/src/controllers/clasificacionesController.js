const pool = require('../db/connection');

const LEVELS = ['seccion', 'familia', 'subfamilia'];
const PARENT_LEVEL = { familia: 'seccion', subfamilia: 'familia' };

const newId = () => `CLA-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const getClasificaciones = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nivel, nombre, padre_id FROM clasificaciones_articulos ORDER BY nombre'
    );
    res.json({ success: true, clasificaciones: result.rows });
  } catch (error) {
    console.error('Error en getClasificaciones:', error);
    res.status(500).json({ error: 'Error obteniendo clasificaciones' });
  }
};

const createClasificacion = async (req, res) => {
  try {
    const nivel = req.body.nivel;
    const nombre = String(req.body.nombre || '').trim();
    const padreId = req.body.padre_id || null;

    if (!LEVELS.includes(nivel)) return res.status(400).json({ error: 'Nivel no válido' });
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

    if (nivel === 'seccion') {
      if (padreId) return res.status(400).json({ error: 'Una sección no tiene padre' });
    } else {
      const parent = await pool.query(
        'SELECT id FROM clasificaciones_articulos WHERE id = $1 AND nivel = $2',
        [padreId, PARENT_LEVEL[nivel]]
      );
      if (parent.rows.length === 0) {
        return res.status(400).json({ error: `Seleccione ${PARENT_LEVEL[nivel] === 'seccion' ? 'la sección' : 'la familia'} a la que pertenece` });
      }
    }

    const duplicate = await pool.query(
      `SELECT id FROM clasificaciones_articulos
       WHERE nivel = $1 AND lower(nombre) = lower($2) AND padre_id IS NOT DISTINCT FROM $3`,
      [nivel, nombre, padreId]
    );
    if (duplicate.rows.length > 0) return res.status(409).json({ error: 'Ya existe ese elemento' });

    const result = await pool.query(
      `INSERT INTO clasificaciones_articulos (id, nivel, nombre, padre_id)
       VALUES ($1, $2, $3, $4) RETURNING id, nivel, nombre, padre_id`,
      [newId(), nivel, nombre, padreId]
    );
    res.status(201).json({ success: true, clasificacion: result.rows[0] });
  } catch (error) {
    console.error('Error en createClasificacion:', error);
    res.status(500).json({ error: 'Error creando la clasificación' });
  }
};

// Los artículos conservan su texto de sección/familia/subfamilia; solo se quita del catálogo.
const deleteClasificacion = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM clasificaciones_articulos WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error en deleteClasificacion:', error);
    res.status(500).json({ error: 'Error eliminando la clasificación' });
  }
};

module.exports = { getClasificaciones, createClasificacion, deleteClasificacion };
