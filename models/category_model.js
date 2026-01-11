const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  tendanhmuc: String,               // Tên danh mục: Áo, Quần, Giày...
  slug: String,                     // URL-friendly: ao, quan, giay
  mota: String,                     // Mô tả danh mục
  hinhanh: String,                  // Hình ảnh đại diện
  danhmuccha: {                     // ID danh mục cha (nếu là danh mục con)
    type: mongoose.Schema.Types.ObjectId,
    ref: "Danhmuc",
    default: null
  },
  thutu: {                          // Thứ tự hiển thị
    type: Number,
    default: 0
  },
  trangthai: {                      // active/inactive
    type: String,
    default: "active"
  },
  daxoa: {
    type: Boolean,
    default: false
  },
  ngaytao: {
    type: Date,
    default: Date.now
  }
});

const Danhmuc = mongoose.model("Danhmuc", categorySchema, "categories");
module.exports = Danhmuc;
