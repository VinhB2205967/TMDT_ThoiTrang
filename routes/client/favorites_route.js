const express = require("express");
const router = express.Router();
const controller = require("../../controllers/client/favorites_controller");
const { requireAuth } = require('../../middlewares/auth');

// GET /favorites - Trang danh sách yêu thích
router.get("/", requireAuth, controller.danhSach);

module.exports = router;
