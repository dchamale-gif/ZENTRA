const pool = require('../db/connection');

// Middleware para registrar todas las operaciones
const auditMiddleware = async (req, res, next) => {
  try {
    // Capturar la respuesta original
    const originalJson = res.json;

    res.json = async function(data) {
      // Si es una operación de escritura, registrar en audit_log
      if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.user) {
        try {
          const tabla = req.path.split('/')[1]; // Obtener tabla desde URL
          const accion = mapearAccion(req.method);
          
          await pool.query(
            `INSERT INTO audit_log 
             (user_id, accion, tabla_afectada, ip_address, user_agent, datos_despues, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              req.user.id,
              accion,
              tabla,
              req.ip || 'desconocida',
              req.get('user-agent') || 'desconocido',
              JSON.stringify(data)
            ]
          );
        } catch (error) {
          console.error('Error registrando en audit_log:', error);
          // No bloquear la respuesta si hay error en audit
        }
      }

      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    console.error('Error en auditMiddleware:', error);
    next(); // No bloquear si hay error
  }
};

// Mapear método HTTP a acción de auditoría
const mapearAccion = (metodo) => {
  switch(metodo) {
    case 'POST': return 'CREATE';
    case 'PUT': return 'UPDATE';
    case 'DELETE': return 'DELETE';
    case 'GET': return 'READ';
    default: return 'OTRO';
  }
};

module.exports = {
  auditMiddleware
};
