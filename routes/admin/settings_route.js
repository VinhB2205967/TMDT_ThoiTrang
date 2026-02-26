const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/settings_controller');

router.get('/home', controller.getHomeSettings);
router.put('/home', controller.updateHomeSettings);

module.exports = router;
