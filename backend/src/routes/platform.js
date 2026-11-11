const express = require('express');
const platformController = require('../controllers/platformController');
const clientes = require('../controllers/soporteClientesController');
const facturas = require('../controllers/facturasPlataformaController');
const equipo = require('../controllers/equipoSoporteController');
const { platformAuthMiddleware } = require('../middleware/platformAuth');

const router = express.Router();

router.use(platformAuthMiddleware);
// Caddy lo consulta antes de cada petición al portal de automatizaciones (/pruebas):
// si el middleware deja pasar, hay sesión de soporte activa.
router.get('/sesion', (req, res) => res.sendStatus(204));

// Equipo de soporte: cuentas que entran a este panel.
router.get('/equipo', equipo.listar);
router.post('/equipo', equipo.crear);
router.post('/equipo/:id/password', equipo.cambiarPassword);
router.post('/equipo/:id/estado', equipo.cambiarEstado);
router.post('/organizations', platformController.createOrganization);
router.post('/contratos/vista-previa', platformController.previewContractDocuments);
router.get('/organizations', platformController.listOrganizations);
router.get('/organizations/:id', platformController.getOrganization);
router.post('/organizations/:id/license', platformController.updateLicense);
router.post('/organizations/:id/users-limit', platformController.updateUserLimit);
router.get('/modules', platformController.listModules);
router.post('/organizations/:id/modules', platformController.updateModules);
router.post('/organizations/:id/correo', platformController.resendOnboardingEmail);
router.post('/organizations/:id/baja', platformController.deactivateOrganization);
router.post('/organizations/:id/eliminar', platformController.deleteOrganization);
// Clientes que no usan el ERP (bots, web...): activarles el ERP o marcarlos activos/inactivos.
router.post('/organizations/:id/activar-erp', platformController.activarErp);
router.post('/organizations/:id/estado-cliente', platformController.estadoClienteSinErp);
router.get('/website-analytics', platformController.getWebsiteAnalytics);

// CRM: ficha de la empresa, usuarios, notas y entrada como cliente.
router.get('/organizations/:id/ficha', clientes.ficha);
router.post('/organizations/:id/datos', clientes.actualizarDatos);
router.post('/organizations/:id/usuarios', clientes.crearUsuario);
router.post('/organizations/:id/usuarios/:userId', clientes.actualizarUsuario);
router.post('/organizations/:id/usuarios/:userId/password', clientes.restablecerPassword);
router.post('/organizations/:id/notas', clientes.crearNota);
router.delete('/organizations/:id/notas/:notaId', clientes.borrarNota);
router.post('/organizations/:id/entrar', clientes.entrar);

// Facturación de BotEngine a sus clientes.
router.get('/resumen', facturas.resumen);
router.get('/facturas', facturas.listarFacturas);
router.post('/facturas', facturas.crearFactura);
router.post('/facturas/mensualidades', facturas.generarMensualidades);
router.get('/facturas/:id/pdf', facturas.descargarPdf);
router.post('/facturas/:id/enviar', facturas.reenviarFactura);
router.post('/facturas/:id/pago', facturas.registrarPago);
router.post('/facturas/:id/anular', facturas.anularFactura);

module.exports = router;
