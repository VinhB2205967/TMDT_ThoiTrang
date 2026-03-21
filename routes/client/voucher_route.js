const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middlewares/auth');
const controller = require('../../controllers/client/voucher_controller');

router.get('/', requireAuth, controller.index);

module.exports = router;
