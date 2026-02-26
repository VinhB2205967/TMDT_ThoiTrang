const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/flash_sales_controller');

router.get('/', controller.danhSach);
router.post('/', controller.taoMoi);
router.put('/:id', controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/:id/toggle', controller.batTat);

module.exports = router;
