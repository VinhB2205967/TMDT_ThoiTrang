const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  label: { type: String, alias: 'nhan' },
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
    alias: 'danhsachdiachi',
    type: [addressSchema],
    default: []
  },
  gioitinh: String,                 
  ngaysinh: Date,
  avatar: {
    type: String,
    default: '/images/avatar/avatar.png'
  },
  chukyso: {
    type: String,
    alias: 'chuKy',
    default: ''
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
 
  lastSeenAt: { type: Date, alias: 'lanhoatdongcuoi' },
  lastLoginAt: { type: Date, alias: 'landangnhapcuoi' },
  lastLoginProvider: { type: String, alias: 'phuongthucdangnhapcuoi' },
  lastLoginIp: { type: String, alias: 'ipdangnhapcuoi' },
  lastLoginUserAgent: { type: String, alias: 'trinhduyetdangnhapcuoi' }
});

const Nguoidung = mongoose.model("Nguoidung", userSchema, "users");
module.exports = Nguoidung;
