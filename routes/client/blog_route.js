const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/content/blog_controller');

router.get('/', controller.danhSach);
router.get('/:slug', controller.chiTiet);

module.exports = router;
