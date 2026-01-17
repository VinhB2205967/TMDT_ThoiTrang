const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middlewares/auth');
const controller = require('../../controllers/client/orders_controller');

router.get('/', requireAuth, controller.index);
router.get('/:id', requireAuth, controller.detail);
router.post('/:id/cancel', requireAuth, controller.cancel);
router.post('/:id/reorder', requireAuth, controller.reorder);

module.exports = router;
