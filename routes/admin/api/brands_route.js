const express = require('express');
const controller = require('../../../controllers/admin/api/brands_controller');
const { createImageUpload } = require('../_upload');

const router = express.Router();
const uploadLogo = createImageUpload('brands');

function uploadLogoMiddleware(req, res, next) {
  uploadLogo.single('logo')(req, res, (error) => {
    if (!error) return next();

    let message = 'Upload logo thất bại';
    if (error.message === 'ONLY_IMAGE') message = 'Logo phải là file ảnh (jpg/jpeg/png/gif)';
    else if (error.code === 'LIMIT_FILE_SIZE') message = 'Logo vượt quá dung lượng cho phép (tối đa 2MB)';

    return res.status(400).json({ success: false, message });
  });
}

router.get('/', controller.danhSach);
router.post('/', uploadLogoMiddleware, controller.taoMoi);
router.put('/:id', uploadLogoMiddleware, controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/order', controller.sapXep);
router.patch('/:id/featured', controller.capNhatNoiBat);
router.patch('/:id/active', controller.capNhatHienThi);

module.exports = router;
