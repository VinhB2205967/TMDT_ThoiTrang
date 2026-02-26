const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/blog_controller');
const { createImageUpload } = require('./_upload');

const uploadBlog = createImageUpload('blogs');

router.get('/', controller.danhSach);
router.post('/', uploadBlog.single('image'), controller.taoMoi);
router.put('/:id', uploadBlog.single('image'), controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/:id/publish', controller.capNhatXuatBan);

module.exports = router;
