const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/home_sections_controller');
const { createImageUpload } = require('./_upload');

const uploadHeaderLogo = createImageUpload('site', { maxSize: 2 * 1024 * 1024 });

function uploadHeaderLogoMiddleware(req, res, next) {
  uploadHeaderLogo.single('client_header_logo')(req, res, (error) => {
    if (!error) return next();

    const message = String(error && error.message) === 'ONLY_IMAGE'
      ? 'Logo phải là file ảnh'
      : (error && error.code === 'LIMIT_FILE_SIZE' ? 'Logo tối đa 2MB' : 'Upload logo thất bại');

    if (req.flash) req.flash('error', message);
    return res.redirect('/admin/home-sections');
  });
}

router.get('/', controller.danhSach);
router.post('/client-header', uploadHeaderLogoMiddleware, controller.capNhatHeaderClient);
router.patch('/order', controller.sapXep);
router.patch('/:key/toggle', controller.batTat);
router.put('/:key', controller.capNhat);

module.exports = router;
