const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/auth_controller');
const { body } = require('express-validator');
const { validateRequest } = require('../../middlewares/validate');

router.get(['/auth', '/login', '/register'], controller.trang);
router.get('/forgot-password', controller.trangQuenMatKhau);
router.get('/reset-password', controller.trangDatLaiMatKhau);

router.post(
	'/auth/register',
	[
		body('email').trim().isEmail().withMessage('Email không đúng định dạng').normalizeEmail(),
		body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải tối thiểu 6 ký tự'),
		body('hoten').optional({ checkFalsy: true }).trim().escape()
	],
	validateRequest({ redirectTo: '/auth?mode=register', preserveFields: ['hoten', 'email'] }),
	controller.dangKy
);
router.post(
	'/auth/login',
	[
		body('email').trim().isEmail().withMessage('Email không đúng định dạng').normalizeEmail(),
		body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải tối thiểu 6 ký tự')
	],
	validateRequest({ redirectTo: '/auth?mode=login', preserveFields: ['email', 'remember'] }),
	controller.dangNhap
);
router.post('/auth/logout', controller.dangXuat);

router.post(
	'/forgot-password',
	[
		body('email').trim().isEmail().withMessage('Email không đúng định dạng').normalizeEmail()
	],
	validateRequest({ redirectTo: '/forgot-password', preserveFields: ['email'] }),
	controller.guiEmailDatLaiMatKhau
);

router.post(
	'/reset-password',
	[
		body('token').trim().notEmpty().withMessage('Token không hợp lệ'),
		body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải tối thiểu 6 ký tự'),
		body('confirmPassword').isLength({ min: 6 }).withMessage('Xác nhận mật khẩu tối thiểu 6 ký tự')
	],
	validateRequest({ redirectTo: '/forgot-password' }),
	controller.datLaiMatKhau
);

router.get('/auth/google', controller.batDauGoogle);
router.get('/auth/google/callback', controller.xuLyGoogleCallback);

module.exports = router;
