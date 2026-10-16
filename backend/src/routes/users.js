const express = require('express');
const usersController = require('../controllers/usersController');
const { authMiddleware, rolePermissionMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, rolePermissionMiddleware(['admin_users']));
router.get('/', usersController.listUsers);
router.post('/', usersController.createUser);
router.put('/:id', usersController.updateUser);
router.post('/:id/password', usersController.resetPassword);

module.exports = router;
