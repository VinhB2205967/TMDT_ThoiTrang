const express = require('express')
const router = express.Router();
const controller = require('../../controllers/client/product_controller');
const { uploadOpenclipQuery, validateOpenclipQueryFile } = require('../../middlewares/openclipUpload');

router.post('/image-search', (req, res, next) => {
	uploadOpenclipQuery.single('image')(req, res, (err) => {
		if (!err) {
			return validateOpenclipQueryFile(req, res, (validationErr) => {
				if (!validationErr) return next();
				return res.redirect('/products?openclip_status=unsupported');
			});
		}
		if (err && err.message === 'ONLY_IMAGE') return res.redirect('/products?openclip_status=unsupported');
		if (err && err.message === 'UNSUPPORTED_IMAGE_TYPE') return res.redirect('/products?openclip_status=unsupported');
		if (err && err.code === 'LIMIT_FILE_SIZE') return res.redirect('/products?openclip_status=error');
		return res.redirect('/products?openclip_status=error');
	});
}, controller.timBangAnh);

// Specific routes MUST come before :id
router.get('/', controller.danhSach);
router.get('/filter', controller.danhSach);
router.get('/:id', controller.chiTiet);

module.exports = router;
