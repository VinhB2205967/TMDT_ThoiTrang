const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/imports_controller');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, './public/uploads/imports');
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
	limits: { files: 60 }
});

router.get('/', controller.danhSach);
router.get('/create', controller.taoMoi);
router.post('/create', upload.any(), controller.taoMoiPost);

router.get('/:id', controller.chiTiet);
router.get('/:id/edit', controller.chinhSua);
router.post('/:id/edit', upload.any(), controller.chinhSuaPost);
router.post('/:id/delete', controller.xoaPhieu);

module.exports = router;
