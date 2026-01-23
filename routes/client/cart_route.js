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

module.exports = router;
