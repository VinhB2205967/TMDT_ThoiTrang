const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/orders_controller');

router.get('/', controller.danhSach);
router.get('/export', controller.exportExcel);
router.get('/api/new-summary', controller.tongQuanDonMoi);
router.get('/:id', controller.chiTiet);

router.post('/:id/status', controller.capNhatTrangThai);
router.post('/:id/return/approve', controller.duyetHoanHang);
router.post('/:id/return/reject', controller.tuChoiHoanHang);
router.post('/:id/return/received', controller.xacNhanDaNhanHangHoan);
router.post('/:id/return/refund', controller.hoanTienDon);
router.post('/bulk-status', controller.capNhatTrangThaiHangLoat);
router.post('/:id/cancel', controller.huyDon);

module.exports = router;
