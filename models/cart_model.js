const mongoose = require("mongoose");

// Schema cho sản phẩm trong giỏ hàng
const cartItemSchema = new mongoose.Schema({
  sanpham_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sanpham",
    required: true
  },
  bienthe_id: {                     // ID biến thể (màu sắc)
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  tensanpham: String,               // Lưu tên để hiển thị nhanh
  hinhanh: String,                  // Hình ảnh sản phẩm/biến thể
  mausac: String,                   // Màu sắc đã chọn
  kichco: String,                   // Size đã chọn
  gia: Number,                      // Giá tại thời điểm thêm
  giagiam: Number,                  // Giá sau giảm
  soluong: {
    type: Number,
    default: 1,
    min: 1
  }
}, { _id: true });

const cartSchema = new mongoose.Schema({
  nguoidung_id: {                   
    type: mongoose.Schema.Types.ObjectId,
    ref: "Nguoidung",
    required: true
  },
  sanpham: [cartItemSchema],        // Danh sách sản phẩm trong giỏ
  tongtien: {                       // Tổng tiền (tự tính)
    type: Number,
    default: 0
  },
  ngaytao: {
    type: Date,
    default: Date.now
  },
  ngaycapnhat: {
    type: Date,
    default: Date.now
  }
});

// Middleware tính tổng tiền trước khi lưu
cartSchema.pre('save', function() {
  this.tongtien = this.sanpham.reduce((sum, item) => {
    const gia = item.giagiam || item.gia || 0;
    return sum + (gia * item.soluong);
  }, 0);
  this.ngaycapnhat = new Date();
});

const Giohang = mongoose.model("Giohang", cartSchema, "carts");
module.exports = Giohang;
