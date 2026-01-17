const express = require('express')
const router = express.Router();
const controller = require('../../controllers/client/product_controller');

// Specific routes MUST come before :id
router.get('/', controller.index);
router.get('/:id/options', controller.options);
router.get('/:id', controller.show);

module.exports = router;