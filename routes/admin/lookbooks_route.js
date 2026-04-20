const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/lookbooks_controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadRoot = path.join(process.cwd(), 'public', 'uploads', 'lookbooks');
fs.mkdirSync(uploadRoot, { recursive: true });

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

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadRoot);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadLookbook = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    if (file.fieldname === 'description_media_uploads') {
      if (isDescriptionMediaFile(file)) return cb(null, true);
      return cb(new Error('ONLY_IMAGE_OR_VIDEO'));
    }

    if (isImageFile(file)) return cb(null, true);
    return cb(new Error('ONLY_IMAGE'));
  }
});

const uploadLookbookFields = uploadLookbook.fields([
  { name: 'image', maxCount: 1 },
  { name: 'description_media_uploads', maxCount: 20 }
]);

router.get('/', controller.danhSach);
router.get('/create', controller.trangTaoMoi);
router.post('/create', uploadLookbookFields, controller.taoMoi);
router.get('/edit/:id', controller.trangChinhSua);
router.patch('/edit/:id', uploadLookbookFields, controller.capNhat);
router.post('/edit/:id', uploadLookbookFields, controller.capNhat);
router.delete('/delete/:id', controller.xoa);
router.post('/delete/:id', controller.xoa);
router.patch('/toggle/:id', controller.batTat);
router.post('/toggle/:id', controller.batTat);

module.exports = router;
