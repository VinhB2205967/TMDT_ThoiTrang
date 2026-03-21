const express = require('express');
const controller = require('../../../controllers/admin/api/reports_controller');

const router = express.Router();

router.get('/data', controller.duLieuBaoCao);

module.exports = router;
