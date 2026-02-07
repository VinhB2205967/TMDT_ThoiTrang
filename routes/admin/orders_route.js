const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/orders_controller');

router.get('/', controller.danhSach);
router.get('/export', controller.exportExcel);
router.get('/:id', controller.chiTiet);

router.post('/:id/status', controller.capNhatTrangThai);
router.post('/:id/cancel', controller.huyDon);

module.exports = router;
