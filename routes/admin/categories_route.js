const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/categories_controller');

router.get('/', controller.danhSach);
router.get('/tree', controller.layCayJson);
router.post('/create', controller.taoMoi);
router.post('/sort', controller.sapXep);

router.patch('/:id', controller.capNhat);
router.delete('/:id', controller.xoa);
router.patch('/:id/toggle-active', controller.doiTrangThai);

router.post('/:id/edit', controller.capNhat);
router.post('/:id/toggle', controller.doiTrangThai);
router.post('/:id/delete', controller.xoa);

module.exports = router;
