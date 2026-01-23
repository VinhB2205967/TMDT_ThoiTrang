const express = require('express')
const router = express.Router();
const controller = require('../../controllers/admin/products_controller');
const multer = require('multer');
const path = require('path');

// Cấu hình multer để upload ảnh
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/uploads/products');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Chỉ cho phép upload file ảnh!'));
    }
});

// Upload fields: ảnh chính + ảnh biến thể
const uploadFields = upload.fields([
    { name: 'hinhanh', maxCount: 1 },
    { name: 'bienthe_hinhanh', maxCount: 20 }
]);

// Routes
router.get('/', controller.danhSach);
router.get('/create', controller.taoMoi);
router.post('/create', uploadFields, controller.taoMoiPost);
router.get('/:id/edit', controller.chinhSua);
router.post('/:id/edit', uploadFields, controller.chinhSuaPost);
router.get('/:id/delete', controller.xoaMem);
router.post('/:id/restore', controller.khoiPhuc);
router.post('/:id/hard-delete', controller.xoaVinhVien);
router.patch('/:id/change-status', controller.doiTrangThai);

module.exports = router;