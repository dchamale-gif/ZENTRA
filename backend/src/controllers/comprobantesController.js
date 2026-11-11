const authPool = require('../db/authConnection');
const { datosEmisor } = require('./felController');
const { sendError } = require('./ventasController');

/**
 * GET /api/ventas/empresa
 * Encabezado de los comprobantes impresos y en PDF: los datos de la empresa y, si tiene
 * facturación electrónica configurada, los del emisor (nombre comercial, NIT y dirección fiscal).
 */
const getEmpresa = async (req, res) => {
  try {
    const [organizacion, emisor] = await Promise.all([
      authPool.query(
        'SELECT nombre, nit, telefono, direccion, email FROM organizations WHERE id = $1',
        [req.organization.id]
      ),
      datosEmisor(req.organization.felHabilitada)
    ]);
    const org = organizacion.rows[0] || {};
    res.status(200).json({
      success: true,
      empresa: {
        nombre: emisor?.nombreComercial || org.nombre || req.organization.name || '',
        razonSocial: emisor?.nombre && emisor.nombre !== emisor.nombreComercial ? emisor.nombre : null,
        nit: emisor?.nit || org.nit || null,
        direccion: emisor?.direccion || org.direccion || null,
        telefono: org.telefono || null,
        email: org.email || null
      }
    });
  } catch (error) {
    sendError(res, error, 'Error obteniendo los datos de la empresa');
  }
};

module.exports = { getEmpresa };
