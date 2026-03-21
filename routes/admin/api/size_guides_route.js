const express = require('express');
const controller = require('../../../controllers/admin/api/size_guides_controller');

const router = express.Router();

router.get('/', controller.danhSach);
router.post('/', controller.taoMoi);
router.put('/:id', controller.capNhat);
router.delete('/:id', controller.xoa);

module.exports = router;
