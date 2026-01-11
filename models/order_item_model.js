const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  donhang_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Donhang",
    required: true
  },
  sanpham_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sanpham",
    required: true
  },
  bienthe_id: {                     // ID biến thể nếu có
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Lưu snapshot thông tin sản phẩm tại thời điểm đặt
  tensanpham: String,
  hinhanh: String,
  mausac: String,
  kichco: String,
  
  giagoc: Number,                   // Giá gốc
  giaban: Number,                   // Giá bán (sau giảm)
  soluong: {
    type: Number,
    required: true,
    min: 1
  },
  thanhtien: Number,                // giaban * soluong

  // Trạng thái sản phẩm trong đơn
  trangthai: {                      // pending, confirmed, shipping, delivered, returned
    type: String,
    default: "pending"
  },
  danhgia: {                        // Đã đánh giá chưa
    type: Boolean,
    default: false
  },

  ngaytao: {
    type: Date,
    default: Date.now
  }
});

// Tính thành tiền
orderItemSchema.pre('save', function(next) {
  this.thanhtien = (this.giaban || this.giagoc) * this.soluong;
  next();
});

const Chitietdonhang = mongoose.model("Chitietdonhang", orderItemSchema, "order_item");
module.exports = Chitietdonhang;
