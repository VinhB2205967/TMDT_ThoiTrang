const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/users_controller');

router.get('/', controller.danhSach);
router.get('/:id', controller.chiTiet);

router.post('/:id/update', controller.capNhatTuChiTiet);
router.post('/:id/password', controller.datMatKhauTuChiTiet);
router.post('/:id/restore', controller.khoiPhucTuChiTiet);
router.post('/:id/hard-delete', controller.xoaVinhVien);
router.post('/:id/role', controller.capNhatVaiTro);
router.post('/:id/status', controller.capNhatTrangThai);
router.post('/:id/delete', controller.xoaMem);

module.exports = router;
