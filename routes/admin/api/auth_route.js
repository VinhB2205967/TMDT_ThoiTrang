const express = require('express');
const { body } = require('express-validator');
const controller = require('../../../controllers/admin/api/auth_controller');
const { validateRequest } = require('../../../middlewares/validate');

const router = express.Router();

router.get('/status', controller.trangThai);
router.post(
  '/login',
  [
    body('email').trim().isEmail().withMessage('Email không đúng định dạng').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải tối thiểu 6 ký tự')
  ],
  validateRequest({ redirectTo: '/admin/api/auth/login' }),
  controller.dangNhap
);
router.post('/logout', controller.dangXuat);

module.exports = router;
