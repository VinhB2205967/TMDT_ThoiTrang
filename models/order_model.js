const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  madonhang: {                      // Mã đơn hàng: DH20261101001
    type: String,
    unique: true
  },
  nguoidung_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Nguoidung",
    required: true
  },
  // Thông tin người nhận
  tennguoinhan: String,
  sodienthoai: String,
  email: String,
  diachigiao: String,               // Địa chỉ giao hàng đầy đủ
  tinh: String,
  quan: String,
  phuong: String,
  ghichu: String,                   // Ghi chú của khách

  // Thông tin thanh toán
  phuongthucthanhtoan: {            // cod, banking, momo, vnpay...
    type: String,
    default: "cod"
  },
  dathanhtoan: {
    type: Boolean,
    default: false
  },
  ngaythanhtoan: Date,

  // Thông tin vận chuyển
  phuongthucvanchuyen: {            // standard, express
    type: String,
    default: "standard"
  },
  phivanchuyen: {
    type: Number,
    default: 0
  },
  mavanchuyen: String,              // Mã tracking vận chuyển

  // Tổng tiền
  tamtinh: Number,                  // Tạm tính (tổng sản phẩm)
  giamgia: {                        // Số tiền giảm (voucher)
    type: Number,
    default: 0
  },
  tongtien: Number,                 // Tổng thanh toán

  // Trạng thái đơn hàng
  trangthai: {
    type: String,
    enum: ['choxacnhan', 'daxacnhan', 'dangchuanbi', 'danggiao', 'dagiao', 'dahuy', 'hoanhang'],
    default: 'choxacnhan'
  },
  lydohuy: String,                  // Lý do hủy đơn

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

// Tạo mã đơn hàng tự động
orderSchema.pre('save', function(next) {
  if (!this.madonhang) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.madonhang = `DH${dateStr}${random}`;
  }
  next();
});

const Donhang = mongoose.model("Donhang", orderSchema, "orders");
module.exports = Donhang;
