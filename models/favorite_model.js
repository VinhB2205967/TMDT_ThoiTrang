const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema({
  nguoidung_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Nguoidung",
    required: true
  },
  sanpham_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sanpham",
    required: true
  },
  ngaythem: {
    type: Date,
    default: Date.now
  }
});

// Đảm bảo mỗi user chỉ yêu thích 1 sản phẩm 1 lần
favoriteSchema.index({ nguoidung_id: 1, sanpham_id: 1 }, { unique: true });

const Yeuthich = mongoose.model("Yeuthich", favoriteSchema, "favorites");
module.exports = Yeuthich;
