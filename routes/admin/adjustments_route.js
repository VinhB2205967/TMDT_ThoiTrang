const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/adjustments_controller');

router.get('/', controller.danhSach);
router.get('/create', controller.taoMoi);
router.post('/create', controller.taoMoiPost);
router.get('/:id', controller.chiTiet);
router.post('/:id/confirm', controller.xacNhanPost);
router.post('/:id/delete', controller.xoaPost);

module.exports = router;
