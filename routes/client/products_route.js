const express = require('express')
const router = express.Router();
const controller = require('../../controllers/client/product_controller');

// Specific routes MUST come before :id
router.get('/', controller.danhSach);
router.get('/:id/options', controller.tuyChon);
router.get('/:id', controller.chiTiet);

module.exports = router;