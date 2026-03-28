const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/users_controller');
const { createImageUpload } = require('./_upload');

const uploadUserImages = createImageUpload('avatars', {
  maxSize: 2 * 1024 * 1024,
  maxFiles: 2
});

function uploadAvatarMiddleware(req, res, next) {
  uploadUserImages.fields([
    { name: 'avatarFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 }
  ])(req, res, (error) => {
    if (!error) return next();

    const redirectTo = req.get('referer') || '/admin/users';
    if (error && error.code === 'LIMIT_FILE_SIZE') {
      req.flash('error', 'Ảnh tối đa 2MB');
      return res.redirect(redirectTo);
    }
    if (String(error && error.message) === 'ONLY_IMAGE') {
      req.flash('error', 'Chỉ được upload file ảnh');
      return res.redirect(redirectTo);
    }
    req.flash('error', 'Upload ảnh thất bại');
    return res.redirect(redirectTo);
  });
}

router.get('/', controller.danhSach);
router.get('/:id', controller.chiTiet);

router.post('/:id/update', uploadAvatarMiddleware, controller.capNhatTuChiTiet);
router.post('/:id/password', controller.datMatKhauTuChiTiet);
router.post('/:id/restore', controller.khoiPhucTuChiTiet);
router.post('/:id/hard-delete', controller.xoaVinhVien);
router.post('/:id/role', controller.capNhatVaiTro);
router.post('/:id/status', controller.capNhatTrangThai);
router.post('/:id/delete', controller.xoaMem);

module.exports = router;
