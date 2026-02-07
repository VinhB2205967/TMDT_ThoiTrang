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
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Chỉ cho phép upload ảnh jpg/png/webp'));
  },
  limits: { files: 5 }
});

router.get('/new', requireAuth, controller.taoMoi);
router.get('/:id/edit', requireAuth, controller.sua);
router.post('/', requireAuth, upload.array('hinhanh', 5), controller.taoMoiPost);
router.post('/:id/update', requireAuth, upload.array('hinhanh', 5), controller.capNhat);
router.post('/:id/delete', requireAuth, controller.xoa);
router.patch('/:id', requireAuth, upload.array('hinhanh', 5), controller.capNhat);
router.delete('/:id', requireAuth, controller.xoa);

router.get('/products/:id', controller.layDanhSachTheoSanPham);

module.exports = router;
