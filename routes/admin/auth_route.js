const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/auth_controller');
const { body } = require('express-validator');
const { validateRequest } = require('../../middlewares/validate');

router.get('/login', controller.trangDangNhap);
router.post(
	'/login',
	[
		body('email').trim().isEmail().withMessage('Email không đúng định dạng').normalizeEmail(),
		body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải tối thiểu 6 ký tự')
	],
	validateRequest({ redirectTo: '/admin/login' }),
	controller.dangNhap
);
router.post('/logout', controller.dangXuat);

module.exports = router;
