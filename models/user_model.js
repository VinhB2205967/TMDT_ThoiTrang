const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  label: String,
  tennguoinhan: String,
  sodienthoai: String,
  diachi: String
}, { _id: true });

const userSchema = new mongoose.Schema({
  hoten: String,                    
  email: {
    type: String,
    required: true,
    unique: true
  },
  sodienthoai: String,              
  diachi: String,                   
  diachiList: {                    
    type: [addressSchema],
    default: []
  },
  gioitinh: String,                 
  ngaysinh: Date,
  avatar: {
    type: String,
    default: '/images/avatar/avatar.png'
  },
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
 
  lastSeenAt: Date,
  lastLoginAt: Date,
  lastLoginProvider: String,
  lastLoginIp: String,
  lastLoginUserAgent: String
});

const Nguoidung = mongoose.model("Nguoidung", userSchema, "users");
module.exports = Nguoidung;
