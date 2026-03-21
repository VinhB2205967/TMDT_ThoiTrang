const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/brands_controller');
const { createImageUpload } = require('./_upload');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

const uploadLogo = createImageUpload('brands');

function uploadLogoMiddleware(req, res, next) {
	uploadLogo.single('logo')(req, res, (error) => {
		if (!error) return next();

		let message = 'Upload logo thất bại';
		if (error.message === 'ONLY_IMAGE') message = 'Logo phải là file ảnh hợp lệ';
		else if (error.code === 'LIMIT_FILE_SIZE') message = 'Logo vượt quá dung lượng cho phép (tối đa 2MB)';

		if (req.flash) req.flash('error', message);
		return redirectBackOrDefault(req, res, '/admin/brands');
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
