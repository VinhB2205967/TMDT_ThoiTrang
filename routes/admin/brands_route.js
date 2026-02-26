const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/brands_controller');
const { createImageUpload } = require('./_upload');

const uploadLogo = createImageUpload('brands');

router.get('/', controller.danhSach);
router.post('/', uploadLogo.single('logo'), controller.taoMoi);
router.put('/:id', uploadLogo.single('logo'), controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/order', controller.sapXep);
router.patch('/:id/featured', controller.capNhatNoiBat);

module.exports = router;
