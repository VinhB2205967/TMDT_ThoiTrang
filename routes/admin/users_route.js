const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/users_controller');

router.get('/', controller.index);
router.get('/online', controller.onlineSnapshot);
router.get('/:id', controller.detail);

router.post('/:id/update', controller.updateFromDetail);
router.post('/:id/password', controller.setPasswordFromDetail);
router.post('/:id/restore', controller.restoreFromDetail);
router.post('/:id/hard-delete', controller.hardDelete);
router.post('/:id/role', controller.updateRole);
router.post('/:id/status', controller.updateStatus);
router.post('/:id/delete', controller.softDelete);

module.exports = router;
