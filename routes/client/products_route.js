const express = require('express')
const router = express.Router();
router.get('/', async (req, res) => {
    res.render("client/pages/products/index.pug")
});
router.get('/create', async (req, res) => {
    res.render("client/pages/products/index.pug")
});
router.get('/edit', async (req, res) => {
    res.render("client/pages/products/index.pug")
});
module.exports = router;