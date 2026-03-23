const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  madonhang: {                      
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
  diachigiao: String,               
  tinh: String,
  quan: String,
  phuong: String,
  ghichu: String,                   

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
  vnpayTransId: String,
  vnpayBankCode: String,
  vnpayTxnRef: String,
  momoTransId: String,
  momoOrderId: String,
  momoRequestId: String,
  momoPayUrl: String,
  momoRefunded: {
    type: Boolean,
    default: false
  },
  momoRefundAt: Date,

  // Thông tin vận chuyển
  phuongthucvanchuyen: {           
    type: String,
    default: "standard"
  },
  phivanchuyen: {
    type: Number,
    default: 0
  },
  mavanchuyen: String,              // Mã tracking vận chuyển

  // Tổng tiền
  tamtinh: Number,                  
  giamgia: {                        
    type: Number,
    default: 0
  },
  tongtien: Number,                 // Tổng thanh toán
  voucher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Coupon"
  },
  voucher_code: String,
  voucher_type: String,
  voucher_value: Number,
  voucher_discount: Number,

  // Trạng thái đơn hàng
  trangthai: {
    type: String,
    enum: [
      'choxacnhan',
      'daxacnhan',
      'dangchuanbi',
      'danggiao',
      'dagiao',
      // Tên trạng thái tiếng Việt (ưu tiên dùng cho model)
      'yeucau_hoanhang',
      'daduyet_hoanhang',
      'tuchoi_hoanhang',
      'danggui_hanghoan',
      'danhan_hanghoan',
      'dahoantien',
   
      'requested_return',
      'approved_return',
      'rejected_return',
      'return_shipping',
      'returned',
      'returned_full',
      'returned_partial',
      'refunded',
      'dahuy',
      'hoanhang'
    ],
    default: 'choxacnhan'
  },
  lydohuy: String,                  // Lý do hủy đơn
  ngaygiaohang: Date,

  // Luồng hoàn hàng / hoàn tiền
  yeucauhoanhang: {
    requestedAt: Date,
    reason: {
      type: String,
      enum: ['sai_size', 'loi_san_pham', 'khong_giong_mo_ta', 'khac']
    },
    reasonLabel: String,
    detail: String,
    proofMedias: [String],
    proofMedia: String,
    proofImage: String,
    refundMethod: {
      type: String,
      enum: ['momo', 'bank', 'wallet']
    },
    adminNote: String,
    reviewedAt: Date,
    approvedAt: Date,
    rejectedAt: Date,
    returnedAt: Date,
    refundedAt: Date
  },

  tonggiamdoanhthu_hoantra: {
    type: Number,
    default: 0
  },
  tonggiamloinhuan_hoantra: {
    type: Number,
    default: 0
  },
  tongsoluong_hoantra: {
    type: Number,
    default: 0
  },

  daxoa: {
    type: Boolean,
    default: false
  },
  ngaytao: {
    type: Date,
    default: Date.now
  },
  ngaycapnhat: Date,

  emailxacnhan_dagui: {
    type: Boolean,
    default: false
  },
  emailxacnhan_guio: Date,
  emaildagiao_dagui: {
    type: Boolean,
    default: false
  },
  emaildagiao_guio: Date,
  emailloi_cuoi: String
});

// Tạo mã đơn hàng tự động
orderSchema.pre('save', function() {
  if (!this.madonhang) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.madonhang = `DH${dateStr}${random}`;
  }
});

const Donhang = mongoose.model("Donhang", orderSchema, "orders");
module.exports = Donhang;
