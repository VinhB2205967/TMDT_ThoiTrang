const express = require('express')
const router = express.Router();
const controller = require('../../controllers/admin/dashboard_controller');
router.get('/', controller.bangDieuKhien);
router.get('/ai-assistant', controller.trangAITroLy);
router.post('/ai-assistant', controller.hoiTroAI);

module.exports = router;