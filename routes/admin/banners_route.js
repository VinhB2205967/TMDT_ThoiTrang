const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/banners_controller');
const { createImageUpload } = require('./_upload');

const uploadBanner = createImageUpload('banners');

router.get('/', controller.danhSach);
router.post('/', uploadBanner.single('image'), controller.taoMoi);
router.put('/:id', uploadBanner.single('image'), controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/:id/toggle', controller.batTat);

module.exports = router;
