const express = require('express');
const controller = require('../../../controllers/admin/api/products_controller');

const router = express.Router();

router.patch('/:id/change-status', controller.doiTrangThai);

module.exports = router;
