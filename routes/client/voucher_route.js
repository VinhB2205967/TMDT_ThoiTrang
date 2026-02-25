const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middlewares/auth');
const controller = require('../../controllers/client/voucher_controller');

router.get('/', requireAuth, controller.index);
router.get('/available', requireAuth, controller.available);
router.post('/apply', requireAuth, controller.apply);
router.post('/save', requireAuth, controller.save);

module.exports = router;
