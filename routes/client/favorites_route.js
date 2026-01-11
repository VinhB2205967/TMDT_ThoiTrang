const express = require("express");
const router = express.Router();
const controller = require("../../controllers/client/favorites_controller");

// GET /favorites - Trang danh sách yêu thích
router.get("/", controller.index);

// POST /favorites/add/:id - Thêm sản phẩm vào yêu thích
router.post("/add/:id", controller.add);

// POST /favorites/remove/:id - Xóa sản phẩm khỏi yêu thích
router.post("/remove/:id", controller.remove);

module.exports = router;
