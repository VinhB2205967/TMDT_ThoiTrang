const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/auth_controller');

router.get(['/auth', '/login', '/register'], controller.trang);

router.post('/auth/register', controller.dangKy);
router.post('/auth/login', controller.dangNhap);
router.post('/auth/logout', controller.dangXuat);

router.get('/auth/google', controller.batDauGoogle);
router.get('/auth/google/callback', controller.xuLyGoogleCallback);

module.exports = router;
