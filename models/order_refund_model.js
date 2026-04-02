const mongoose = require('mongoose');

const refundItemSchema = new mongoose.Schema(
  {
    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chitietdonhang',
      default: null,
      alias: 'madongdonhang'
    },
    qty: {
      type: Number,
      default: 0,
      alias: 'soluongyeucauhoan'
    },
    boughtQty: {
      type: Number,
      default: 0,
      alias: 'soluongdamua'
    },
    tensanpham: { type: String, default: '' },
    hinhanh: { type: String, default: '' },
    kichco: { type: String, default: '' },
    mausac: { type: String, default: '' },
    gianhap: { type: Number, default: 0 },
    giabandexuat: { type: Number, default: 0 }
  },
  { _id: false }
);

const orderRefundSchema = new mongoose.Schema({
  donhang_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donhang',
    required: true,
    unique: true,
    index: true
  },
  nguoidung_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    default: null,
    index: true
  },
  madonhang: {
    type: String,
    default: '',
    index: true
  },
  trangthai_donhang: {
    type: String,
    default: '',
    index: true
  },
  requestedAt: {
    type: Date,
    alias: 'thoigianguiyeucau'
  },
  reason: {
    type: String,
    alias: 'lydo'
  },
  reasonLabel: {
    type: String,
    alias: 'nhanlydo'
  },
  detail: {
    type: String,
    default: '',
    alias: 'motachitiet'
  },
  requestedItems: {
    type: [refundItemSchema],
    default: [],
    alias: 'danhsachsanphamyeucauhoan'
  },
  receivedItems: {
    type: [refundItemSchema],
    default: [],
    alias: 'danhsachsanphamdanhanhoan'
  },
  proofMedias: {
    type: [String],
    default: [],
    alias: 'danhsachminhchung'
  },
  proofMedia: {
    type: String,
    default: '',
    alias: 'minhchung'
  },
  proofImage: {
    type: String,
    default: '',
    alias: 'hinhanhminhchung'
  },
  refundMethod: {
    type: String,
    default: '',
    alias: 'phuongthuchoantien'
  },
  refundWallet: {
    type: String,
    default: '',
    alias: 'vihoantien'
  },
  refundBankName: {
    type: String,
    default: '',
    alias: 'tennganhanghoantien'
  },
  refundBankAccountName: {
    type: String,
    default: '',
    alias: 'tenchutaikhoanhoantien'
  },
  refundBankAccountNumber: {
    type: String,
    default: '',
    alias: 'sotaikhoanhoantien'
  },
  refundAmount: {
    type: Number,
    default: 0,
    alias: 'sotienhoan'
  },
  adminNote: {
    type: String,
    default: '',
    alias: 'ghichuadmin'
  },
  reviewedAt: {
    type: Date,
    alias: 'thoigianduyet'
  },
  approvedAt: {
    type: Date,
    alias: 'thoigianduyetchapnhan'
  },
  rejectedAt: {
    type: Date,
    alias: 'thoigiantuchoi'
  },
  returnedAt: {
    type: Date,
    alias: 'thoigiannhanhanghoan'
  },
  refundedAt: {
    type: Date,
    alias: 'thoigianhoantien'
  },
  canceledByUser: {
    type: Boolean,
    default: false,
    alias: 'dahuyboibannguoidung'
  },
  canceledByUserAt: {
    type: Date,
    alias: 'thoigianhuyboibannguoidung'
  },
  lastAction: {
    type: String,
    default: '',
    alias: 'hanhdongcuoi'
  },
  lastActorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    default: null,
    alias: 'nguoithuchiencuoi_id'
  },
  lastActorRole: {
    type: String,
    default: '',
    alias: 'vaitronguoithuchiencuoi'
  },
  lastActorName: {
    type: String,
    default: '',
    alias: 'tennguoithuchiencuoi'
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

orderRefundSchema.index({ nguoidung_id: 1, ngaycapnhat: -1 });
orderRefundSchema.index({ trangthai_donhang: 1, ngaycapnhat: -1 });

module.exports = mongoose.model('OrderRefund', orderRefundSchema, 'order_refunds');
