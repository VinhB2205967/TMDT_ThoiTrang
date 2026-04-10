const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const controller = require('../../../controllers/admin/api/blog_controller');

const router = express.Router();
const uploadRoot = path.join(process.cwd(), 'public', 'uploads', 'blogs');

fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadRoot);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueSuffix + path.extname(file.originalname || '').toLowerCase());
  }
});

const IMAGE_EXTENSIONS = /jpeg|jpg|png|gif|webp/;
const VIDEO_EXTENSIONS = /mp4|webm|ogg|mov|m4v/;

function isImageFile(file) {
  const extname = IMAGE_EXTENSIONS.test(path.extname(file.originalname || '').toLowerCase());
  const mimetype = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(String(file.mimetype || ''));
  return extname && mimetype;
}

function isBlogContentMediaFile(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
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
  storage,
  fileFilter: function (_req, file, cb) {
    if (file.fieldname === 'content_media_uploads') {
      if (isBlogContentMediaFile(file)) {
        return cb(null, true);
      }
      return cb(new Error('Chi cho phep chen anh hoac video hop le trong noi dung blog.'));
    }

    if (isImageFile(file)) {
      return cb(null, true);
    }

    cb(new Error('Chi cho phep upload file anh hop le.'));
  }
});

const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'content_media_uploads', maxCount: 20 }
]);

router.get('/', controller.danhSach);
router.post('/', uploadFields, controller.taoMoi);
router.put('/:id', uploadFields, controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/:id/publish', controller.capNhatXuatBan);
router.patch('/:id/featured', controller.capNhatNoiBat);

module.exports = router;
