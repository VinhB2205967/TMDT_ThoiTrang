const express = require('express');
const controller = require('../../../controllers/admin/api/flash_sales_controller');

const router = express.Router();

router.get('/', controller.danhSach);
router.post('/', controller.taoMoi);
router.put('/:id', controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/:id/toggle', controller.batTat);

module.exports = router;
