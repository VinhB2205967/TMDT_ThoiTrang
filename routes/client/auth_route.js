const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/auth_controller');
const { body } = require('express-validator');
const { validateRequest } = require('../../middlewares/validate');

router.get(['/auth', '/login', '/register'], controller.trang);

router.post(
	'/auth/register',
	[
		body('email').trim().isEmail().withMessage('Email không đúng định dạng').normalizeEmail(),
		body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải tối thiểu 6 ký tự'),
		body('hoten').optional({ checkFalsy: true }).trim().escape()
	],
	validateRequest({ redirectTo: '/auth?mode=register' }),
	controller.dangKy
);
router.post(
	'/auth/login',
	[
		body('email').trim().isEmail().withMessage('Email không đúng định dạng').normalizeEmail(),
		body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải tối thiểu 6 ký tự')
	],
	validateRequest({ redirectTo: '/auth?mode=login' }),
	controller.dangNhap
);
router.post('/auth/logout', controller.dangXuat);

router.get('/auth/google', controller.batDauGoogle);
router.get('/auth/google/callback', controller.xuLyGoogleCallback);

module.exports = router;
