const express = require("express");
const router = express.Router();
const controller = require("../../controllers/client/favorites_controller");
const { requireAuth } = require('../../middlewares/auth');

// GET /favorites - Trang danh sách yêu thích
router.get("/", requireAuth, controller.index);

// GET /favorites/ids - Get all favorite product ids for current user
router.get('/ids', requireAuth, controller.ids);

// POST /favorites/add/:id - Thêm sản phẩm vào yêu thích
router.post("/add/:id", requireAuth, controller.add);

// POST /favorites/remove/:id - Xóa sản phẩm khỏi yêu thích
router.post("/remove/:id", requireAuth, controller.remove);

// POST /favorites/toggle/:id - Toggle
router.post('/toggle/:id', requireAuth, controller.toggle);

module.exports = router;
