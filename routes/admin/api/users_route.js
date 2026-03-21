const express = require('express');
const controller = require('../../../controllers/admin/api/users_controller');

const router = express.Router();

router.get('/online', controller.anhChupOnline);

module.exports = router;
