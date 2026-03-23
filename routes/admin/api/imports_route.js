const express = require('express');
const multer = require('multer');
const path = require('path');
const controller = require('../../../controllers/admin/api/imports_controller');

const router = express.Router();

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
    cb(new Error('Chi cho phep upload file anh!'));
  },
  limits: { files: 60 }
});

router.get('/', controller.danhSach);
router.get('/create-data', controller.duLieuTaoMoi);
router.post('/', upload.any(), controller.taoMoi);

router.get('/:id', controller.chiTiet);
router.get('/:id/edit-data', controller.duLieuChinhSua);
router.put('/:id', upload.any(), controller.chinhSua);
router.post('/:id/confirm', controller.xuatKhoPhieu);
router.post('/:id/export', controller.xuatKhoPhieu);
router.delete('/:id', controller.xoaPhieu);

module.exports = router;
