const express = require('express');
const controller = require('../../../controllers/admin/api/exports_controller');

const router = express.Router();

router.get('/', controller.danhSach);
router.get('/create-data', controller.duLieuTaoMoi);
router.post('/', controller.taoMoi);
router.get('/:id', controller.chiTiet);

module.exports = router;
