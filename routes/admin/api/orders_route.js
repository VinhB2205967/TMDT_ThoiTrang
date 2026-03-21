const express = require('express');
const controller = require('../../../controllers/admin/api/orders_controller');

const router = express.Router();

router.get('/new-summary', controller.tongQuanDonMoi);

module.exports = router;
