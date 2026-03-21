const express = require('express');
const controller = require('../../../controllers/admin/api/home_sections_controller');

const router = express.Router();

router.get('/', controller.danhSach);
router.patch('/order', controller.sapXep);
router.patch('/:key/toggle', controller.batTat);
router.put('/:key', controller.capNhat);

module.exports = router;
