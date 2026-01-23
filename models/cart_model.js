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
  tensanpham: String,               
  hinhanh: String,                 
  mausac: String,                  
  kichco: String,                  
  gia: Number,                     
  giagiam: Number,                 
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
  sanpham: [cartItemSchema],        
  tongtien: {                       
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
