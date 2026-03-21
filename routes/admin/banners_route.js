const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/banners_controller');

router.get('/', controller.danhSach);

module.exports = router;
