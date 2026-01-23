const express = require('express')
const router = express.Router();
const controller = require('../../controllers/admin/dashboard_controller');
router.get('/', controller.bangDieuKhien);

module.exports = router;