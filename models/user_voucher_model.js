const mongoose = require('mongoose');

const userVoucherSchema = new mongoose.Schema({
  nguoidung_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    required: true
  },
  voucher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    required: true
  },
  isUsed: {
    type: Boolean,
    alias: 'dasudung',
    default: false
  },
  savedAt: {
    type: Date,
    alias: 'thoigianluu',
    default: Date.now
  },
  usedAt: { type: Date, alias: 'thoigiansudung' }
});

userVoucherSchema.index({ nguoidung_id: 1, voucher_id: 1 }, { unique: true });

const UserVoucher = mongoose.model('UserVoucher', userVoucherSchema, 'user_vouchers');
module.exports = UserVoucher;
