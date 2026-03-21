const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/lookbooks_controller');
const { createImageUpload } = require('./_upload');

const uploadLookbook = createImageUpload('lookbooks');

router.get('/', controller.danhSach);
router.get('/create', controller.trangTaoMoi);
router.post('/create', uploadLookbook.single('image'), controller.taoMoi);
router.get('/edit/:id', controller.trangChinhSua);
router.patch('/edit/:id', uploadLookbook.single('image'), controller.capNhat);
router.post('/edit/:id', uploadLookbook.single('image'), controller.capNhat);
router.delete('/delete/:id', controller.xoa);
router.post('/delete/:id', controller.xoa);
router.patch('/toggle/:id', controller.batTat);
router.post('/toggle/:id', controller.batTat);

module.exports = router;
