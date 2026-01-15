const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true, // Tự động viết hoa: SALE50
    trim: true
  },
  mota: String, // Mô tả ngắn về mã
  
  loai: {
    type: String,
    enum: ['phantram', 'tientruc_tiep'], // phantram: Giảm %, tientruc_tiep: Giảm số tiền cụ thể
    required: true
  },
  giatri: {
    type: Number,
    required: true,
    min: 0
  },
  
  don_toithieu: { // Giá trị đơn hàng tối thiểu để áp dụng mã
    type: Number,
    default: 0
  },
  giam_toida: { // Số tiền giảm tối đa (chỉ dùng khi loai là 'phantram')
    type: Number,
    min: 0
  },
  
  ngay_batdau: {
    type: Date,
    default: Date.now
  },
  ngay_ketthuc: {
    type: Date,
    required: true
  },
  
  soluong_toida: { // Tổng số lần mã có thể sử dụng
    type: Number,
    default: 100
  },
  soluong_dasudung: { // Số lần đã dùng
    type: Number,
    default: 0
  },
  
  trangthai: { // 'active', 'inactive'
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  daxoa: {
    type: Boolean,
    default: false
  },
  
  ngaytao: { type: Date, default: Date.now },
  ngaycapnhat: Date
}, {
  minimize: false
});

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ daxoa: 1, trangthai: 1, ngay_ketthuc: 1 });

couponSchema.pre('save', function (next) {
  this.ngaycapnhat = new Date();
  next();
});

couponSchema.path('ngay_ketthuc').validate(function (value) {
  if (!value) return true;
  const start = this.ngay_batdau || this.ngaytao || new Date(0);
  return value > start;
}, 'ngay_ketthuc phải lớn hơn ngay_batdau');

couponSchema.path('soluong_dasudung').validate(function (value) {
  if (value == null) return true;
  const max = this.soluong_toida;
  if (max == null) return true;
  return value <= max;
}, 'soluong_dasudung không được vượt soluong_toida');

const Coupon = mongoose.model("Coupon", couponSchema, "coupons");
module.exports = Coupon;
