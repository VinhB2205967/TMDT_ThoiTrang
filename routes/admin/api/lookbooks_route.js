const express = require('express');
const controller = require('../../../controllers/admin/api/lookbooks_controller');
const { createImageUpload } = require('../_upload');

const router = express.Router();
const uploadLookbook = createImageUpload('lookbooks');

router.get('/', controller.danhSach);
router.post('/', uploadLookbook.single('image'), controller.taoMoi);
router.put('/:id', uploadLookbook.single('image'), controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/:id/toggle', controller.batTat);
router.patch('/:id/featured', controller.capNhatNoiBat);

module.exports = router;
