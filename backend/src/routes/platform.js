const express = require('express');
const platformController = require('../controllers/platformController');
const { platformAuthMiddleware } = require('../middleware/platformAuth');

const router = express.Router();

router.use(platformAuthMiddleware);
router.post('/organizations', platformController.createOrganization);
router.get('/organizations', platformController.listOrganizations);
router.get('/organizations/:id', platformController.getOrganization);
router.post('/organizations/:id/license', platformController.updateLicense);
router.post('/organizations/:id/users-limit', platformController.updateUserLimit);
router.get('/modules', platformController.listModules);
router.post('/organizations/:id/modules', platformController.updateModules);
router.post('/organizations/:id/correo', platformController.resendOnboardingEmail);
router.post('/organizations/:id/baja', platformController.deactivateOrganization);
router.get('/website-analytics', platformController.getWebsiteAnalytics);

module.exports = router;
