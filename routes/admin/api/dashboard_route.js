const express = require('express');
const controller = require('../../../controllers/admin/api/dashboard_controller');

const router = express.Router();

router.post('/ai-assistant', controller.hoiTroAI);

module.exports = router;
