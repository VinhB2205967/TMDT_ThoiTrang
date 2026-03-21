const express = require('express');
const controller = require('../../../controllers/admin/api/settings_controller');

const router = express.Router();

router.get('/home', controller.getHomeSettings);
router.put('/home', controller.updateHomeSettings);

module.exports = router;
