const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/chat_controller');

router.get('/', controller.trangChat);

module.exports = router;
