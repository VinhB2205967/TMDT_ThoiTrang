const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/exports_controller');

router.get('/', controller.danhSach);
router.get('/create', controller.taoMoi);
router.post('/create', controller.taoMoiPost);
router.get('/:id', controller.chiTiet);

module.exports = router;
