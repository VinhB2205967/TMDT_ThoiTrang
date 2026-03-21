const express = require('express');
const controller = require('../../../controllers/admin/api/reviews_controller');

const router = express.Router();

router.get('/stats', controller.thongKe);

module.exports = router;
