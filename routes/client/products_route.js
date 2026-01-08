const express = require('express')
const router = express.Router();
const controller = require('../../controllers/client/product_controller');
router.get('/', controller.index);
router.get('/create', async (req, res) => {
    res.render("client/pages/products/index.pug")
});
router.get('/edit', controller.edit);
module.exports = router;