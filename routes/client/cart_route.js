const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middlewares/auth');
const controller = require('../../controllers/client/cart_controller');

router.get('/', requireAuth, controller.danhSach);
router.post('/add', requireAuth, controller.them);
router.post('/buy-now', requireAuth, controller.muaNgay);
router.post('/update', requireAuth, controller.capNhatSoLuong);
router.post('/update-options', requireAuth, controller.capNhatTuyChon);
router.post('/remove', requireAuth, controller.xoa);
router.post('/clear', requireAuth, controller.xoaHet);
router.get('/checkout', requireAuth, controller.trangThanhToan);
router.post('/checkout', requireAuth, controller.xuLyThanhToan);
router.get('/momo/return', requireAuth, controller.momoReturn);
router.post('/momo/ipn', controller.momoIpn);
router.get('/vnpay/return', requireAuth, controller.vnpayReturn);
router.get('/vnpay/ipn', controller.vnpayIpn);
router.post('/vnpay/ipn', controller.vnpayIpn);

module.exports = router;
