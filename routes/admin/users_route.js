const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/users_controller');

router.get('/', controller.index);
router.get('/online', controller.onlineSnapshot);
router.post('/:id/role', controller.updateRole);
router.post('/:id/status', controller.updateStatus);
router.post('/:id/delete', controller.softDelete);

module.exports = router;
