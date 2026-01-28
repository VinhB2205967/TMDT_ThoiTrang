const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middlewares/auth');
const controller = require('../../controllers/client/orders_controller');

router.get('/', requireAuth, controller.danhSach);
router.get('/:id', requireAuth, controller.chiTiet);
router.get('/:id/payment-status', requireAuth, controller.kiemTraThanhToan);
router.post('/:id/cancel', requireAuth, controller.huyDon);
router.post('/:id/reorder', requireAuth, controller.muaLai);
router.post('/:id/pay', requireAuth, controller.thanhToanLai);
router.post('/:id/change-payment', requireAuth, controller.doiPhuongThucThanhToan);

module.exports = router;
