const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/auth_controller');

router.get('/login', controller.trangDangNhap);
router.post('/login', controller.dangNhap);
router.post('/logout', controller.dangXuat);

module.exports = router;
