const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/size_guides_controller');

router.get('/', controller.danhSach);
router.get('/create', controller.taoMoi);
router.post('/create', controller.taoMoiPost);
router.get('/:id/edit', controller.chinhSua);
router.post('/:id/edit', controller.chinhSuaPost);
router.post('/:id/delete', controller.xoa);

module.exports = router;
