const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/vouchers_controller');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, './public/uploads/vouchers');
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		cb(null, uniqueSuffix + path.extname(file.originalname));
	}
});

const upload = multer({
	storage,
	fileFilter: function (req, file, cb) {
		const filetypes = /jpeg|jpg|png|gif|webp/;
		const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
		const mimetype = filetypes.test(file.mimetype);
		if (mimetype && extname) return cb(null, true);
		cb(new Error('Chỉ cho phép upload file ảnh!'));
	},
	limits: { files: 1 }
});

router.get('/', controller.danhSach);
router.get('/create', controller.taoMoi);
router.post('/create', upload.single('banner'), controller.taoMoiPost);
router.get('/:id/edit', controller.sua);
router.post('/:id/edit', upload.single('banner'), controller.capNhat);
router.post('/:id/toggle', controller.toggleStatus);

module.exports = router;
