const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/home_sections_controller');

router.get('/', controller.danhSach);
router.patch('/order', controller.sapXep);
router.patch('/:key/toggle', controller.batTat);
router.put('/:key', controller.capNhat);

module.exports = router;
