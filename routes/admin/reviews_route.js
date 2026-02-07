const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/reviews_controller');

router.get('/', controller.danhSach);
router.get('/stats', controller.thongKe);
router.post('/:id/visibility', controller.capNhatHienThi);
router.post('/:id/delete', controller.xoa);
router.patch('/:id/visibility', controller.capNhatHienThi);
router.delete('/:id', controller.xoa);

module.exports = router;
