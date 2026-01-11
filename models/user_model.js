const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  hoten: String,                    // Họ tên đầy đủ
  email: {
    type: String,
    required: true,
    unique: true
  },
  matkhau: String,                  // Mật khẩu (đã hash)
  sodienthoai: String,              // Số điện thoại
  diachi: String,                   // Địa chỉ mặc định
  gioitinh: String,                 // Nam/Nữ/Khác
  ngaysinh: Date,
  avatar: String,                   // URL ảnh đại diện
  vaitro: {                         // Vai trò: user, admin
    type: String,
    default: "user"
  },
  trangthai: {                      // Trạng thái: active, blocked
    type: String,
    default: "active"
  },
  xacthuc: {                        // Email đã xác thực chưa
    type: Boolean,
    default: false
  },
  tokenxacthuc: String,             // Token xác thực email
  tokenquenmatkhau: String,         // Token reset mật khẩu
  thoigianhethan: Date,             // Thời gian hết hạn token
  daxoa: {
    type: Boolean,
    default: false
  },
  ngaytao: {
    type: Date,
    default: Date.now
  },
  ngaycapnhat: Date
});

const Nguoidung = mongoose.model("Nguoidung", userSchema, "users");
module.exports = Nguoidung;
