const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  label: String,
  tennguoinhan: String,
  sodienthoai: String,
  diachi: String
}, { _id: true });

const userSchema = new mongoose.Schema({
  hoten: String,                    // Họ tên đầy đủ
  email: {
    type: String,
    required: true,
    unique: true
  },
  sodienthoai: String,              
  diachi: String,                   // Địa chỉ mặc định
  diachiList: {                     // Nhiều địa chỉ, chọn 1 khi thanh toán
    type: [addressSchema],
    default: []
  },
  gioitinh: String,                 // Nam/Nữ/Khác
  ngaysinh: Date,
  avatar: String,                   // URL ảnh đại diện
  daxoa: {
    type: Boolean,
    default: false
  },
  ngaytao: {
    type: Date,
    default: Date.now
  },
  ngaycapnhat: Date
  ,
  // Activity tracking
  lastSeenAt: Date,
  lastLoginAt: Date,
  lastLoginProvider: String,
  lastLoginIp: String,
  lastLoginUserAgent: String
});

const Nguoidung = mongoose.model("Nguoidung", userSchema, "users");
module.exports = Nguoidung;
