const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../../middlewares/auth');
const controller = require('../../controllers/client/reviews_controller');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/uploads/reviews');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImage = /\.(jpeg|jpg|png|webp)$/i.test(ext)
      && /image\/(jpeg|jpg|png|webp)/i.test(String(file.mimetype || ''));
    const isVideo = /\.(mp4|mov|webm|mkv)$/i.test(ext)
      && /video\/(mp4|quicktime|webm|x-matroska)/i.test(String(file.mimetype || ''));
    if (isImage || isVideo) return cb(null, true);
    cb(new Error('Chỉ cho phép upload ảnh/video (jpg/png/webp/mp4/mov/webm/mkv)'));
  },
  limits: { files: 8, fileSize: 100 * 1024 * 1024 }
});

const uploadReviewMedia = (req, res, next) => {
  const handler = upload.fields([{ name: 'images', maxCount: 5 }, { name: 'videos', maxCount: 3 }]);
  handler(req, res, (err) => {
    if (!err) return next();
    const msg = err && err.code === 'LIMIT_FILE_SIZE'
      ? 'File quá lớn. Ảnh tối đa 20MB, video tối đa 100MB.'
      : (err && err.message ? err.message : 'Không thể upload media đánh giá');
    req.flash?.('error', msg);
    return res.redirect('back');
  });
};

router.get('/new', requireAuth, controller.taoMoi);
router.get('/:id/edit', requireAuth, controller.sua);
router.post('/', requireAuth, uploadReviewMedia, controller.taoMoiPost);
router.post('/:id/update', requireAuth, uploadReviewMedia, controller.capNhat);
router.post('/:id/delete', requireAuth, controller.xoa);
router.patch('/:id', requireAuth, uploadReviewMedia, controller.capNhat);
router.delete('/:id', requireAuth, controller.xoa);

module.exports = router;
