const express = require('express')
const router = express.Router();
const controller = require('../../controllers/client/home_controller');
router.get('/', controller.trangChu);

module.exports = router;