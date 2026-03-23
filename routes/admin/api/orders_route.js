const express = require('express');
const controller = require('../../../controllers/admin/api/orders_controller');

const router = express.Router();

router.get('/', controller.danhSach);
router.get('/new-summary', controller.tongQuanDonMoi);
router.get('/export/excel', controller.exportExcel);
router.patch('/bulk/status', controller.capNhatTrangThaiHangLoat);

router.get('/:id', controller.chiTiet);
router.patch('/:id/status', controller.capNhatTrangThai);
router.post('/:id/return/approve', controller.duyetHoanHang);
router.post('/:id/return/reject', controller.tuChoiHoanHang);
router.post('/:id/return/received', controller.xacNhanDaNhanHangHoan);
router.post('/:id/refund', controller.hoanTienDon);
router.post('/:id/cancel', controller.huyDon);

module.exports = router;
