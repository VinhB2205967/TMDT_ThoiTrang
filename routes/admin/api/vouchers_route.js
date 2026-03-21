const express = require('express');
const controller = require('../../../controllers/admin/api/vouchers_controller');
const { createImageUpload } = require('../_upload');

const router = express.Router();
const uploadVoucher = createImageUpload('vouchers');

router.get('/', controller.danhSach);
router.post('/', uploadVoucher.single('banner'), controller.taoMoi);
router.put('/:id', uploadVoucher.single('banner'), controller.capNhat);
router.patch('/:id/toggle', controller.toggleStatus);

module.exports = router;
