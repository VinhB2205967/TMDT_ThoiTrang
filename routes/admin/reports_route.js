const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/reports_controller');

router.get('/', controller.trangBaoCao);

module.exports = router;
