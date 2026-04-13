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

const IMAGE_EXTENSIONS = /jpeg|jpg|png|gif|webp/;
const VIDEO_EXTENSIONS = /mp4|webm|ogg|mov|m4v/;

function isImageFile(file) {
    const extname = IMAGE_EXTENSIONS.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(String(file.mimetype || ''));
    return extname && mimetype;
}

function isDescriptionMediaFile(file) {
    const extension = path.extname(file.originalname).toLowerCase();
    const mimetype = String(file.mimetype || '').toLowerCase();

    if (IMAGE_EXTENSIONS.test(extension) && /^image\/(jpeg|jpg|png|gif|webp)$/i.test(mimetype)) {
        return true;
    }

    if (VIDEO_EXTENSIONS.test(extension) && /^(video\/mp4|video\/webm|video\/ogg|video\/quicktime|video\/x-m4v)$/i.test(mimetype)) {
        return true;
    }

    return false;
}

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.fieldname === 'mota_media_uploads') {
            if (isDescriptionMediaFile(file)) {
                return cb(null, true);
            }
            return cb(new Error('Chỉ cho phép chèn ảnh hoặc video hợp lệ trong nội dung mô tả!'));
        }

        if (isImageFile(file)) {
            return cb(null, true);
        }

        cb(new Error('Chỉ cho phép upload file ảnh!'));
    }
});

// Upload fields: ảnh chính + ảnh biến thể
const uploadFields = upload.fields([
    { name: 'hinhanh', maxCount: 1 },
    { name: 'mota_hinhanh', maxCount: 1 },
    { name: 'bienthe_hinhanh', maxCount: 20 },
    { name: 'mota_media_uploads', maxCount: 20 }
]);

// Routes
router.get('/', controller.danhSach);
router.get('/create', controller.taoMoi);
router.post('/create', uploadFields, controller.taoMoiPost);
// Alias để hỗ trợ link cũ/nhầm: /admin/products/:id/back
router.get('/:id/back', controller.khoiPhuc);
router.get('/:id/edit', controller.chinhSua);
router.post('/:id/edit', uploadFields, controller.chinhSuaPost);
router.get('/:id/delete', controller.xoaMem);
router.post('/:id/toggle-status', controller.toggleTrangThai);
router.post('/:id/restore', controller.khoiPhuc);
router.post('/:id/hard-delete', controller.xoaVinhVien);

module.exports = router;
