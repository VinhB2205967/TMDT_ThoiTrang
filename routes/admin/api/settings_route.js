const express = require('express');
const controller = require('../../../controllers/admin/api/settings_controller');
const { createImageUpload } = require('../_upload');

const router = express.Router();
const uploadHeaderLogo = createImageUpload('site', { maxSize: 2 * 1024 * 1024 });

function uploadHeaderLogoMiddleware(req, res, next) {
  uploadHeaderLogo.single('client_header_logo')(req, res, (error) => {
    if (!error) return next();

    let message = 'Upload logo thất bại';
    if (String(error && error.message) === 'ONLY_IMAGE') message = 'Logo phải là file ảnh';
    else if (error && error.code === 'LIMIT_FILE_SIZE') message = 'Logo tối đa 2MB';

    return res.status(400).json({ success: false, message });
  });
}

router.get('/home', controller.getHomeSettings);
router.put('/home', controller.updateHomeSettings);
router.get('/client-header', controller.getClientHeaderSettings);
router.put('/client-header', uploadHeaderLogoMiddleware, controller.updateClientHeaderSettings);

module.exports = router;
