const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/blog_controller');

router.get('/', controller.danhSach);
router.get('/create', controller.taoMoiPage);
router.get('/:id/edit', controller.chinhSuaPage);

module.exports = router;
