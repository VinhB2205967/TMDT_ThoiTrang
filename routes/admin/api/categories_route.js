const express = require('express');
const controller = require('../../../controllers/admin/api/categories_controller');

const router = express.Router();

router.get('/', controller.danhSach);
router.get('/tree', controller.treeJson);
router.post('/', controller.taoMoi);
router.patch('/order', controller.sapXep);
router.patch('/:id', controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/:id/toggle-active', controller.doiTrangThai);

module.exports = router;
