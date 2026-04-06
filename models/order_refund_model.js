const mongoose = require('mongoose');

const refundItemSchema = new mongoose.Schema(
  {
    madongdonhang: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chitietdonhang',
      default: null,
      alias: 'orderItemId'
    },
    soluongyeucauhoan: {
      type: Number,
      default: 0,
      alias: 'qty'
    },
    soluongdamua: {
      type: Number,
      default: 0,
      alias: 'boughtQty'
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
  thoigianguiyeucau: {
    type: Date,
    alias: 'requestedAt'
  },
  lydo: {
    type: String,
    alias: 'reason'
  },
  nhanlydo: {
    type: String,
    alias: 'reasonLabel'
  },
  motachitiet: {
    type: String,
    default: '',
    alias: 'detail'
  },
  danhsachsanphamyeucauhoan: {
    type: [refundItemSchema],
    default: [],
    alias: 'requestedItems'
  },
  danhsachsanphamdanhanhoan: {
    type: [refundItemSchema],
    default: [],
    alias: 'receivedItems'
  },
  danhsachminhchung: {
    type: [String],
    default: [],
    alias: 'proofMedias'
  },
  minhchung: {
    type: String,
    default: '',
    alias: 'proofMedia'
  },
  hinhanhminhchung: {
    type: String,
    default: '',
    alias: 'proofImage'
  },
  phuongthuchoantien: {
    type: String,
    default: '',
    alias: 'refundMethod'
  },
  vihoantien: {
    type: String,
    default: '',
    alias: 'refundWallet'
  },
  tennganhanghoantien: {
    type: String,
    default: '',
    alias: 'refundBankName'
  },
  tenchutaikhoanhoantien: {
    type: String,
    default: '',
    alias: 'refundBankAccountName'
  },
  sotaikhoanhoantien: {
    type: String,
    default: '',
    alias: 'refundBankAccountNumber'
  },
  sotienhoan: {
    type: Number,
    default: 0,
    alias: 'refundAmount'
  },
  ghichuadmin: {
    type: String,
    default: '',
    alias: 'adminNote'
  },
  thoigianduyet: {
    type: Date,
    alias: 'reviewedAt'
  },
  thoigianduyetchapnhan: {
    type: Date,
    alias: 'approvedAt'
  },
  thoigiantuchoi: {
    type: Date,
    alias: 'rejectedAt'
  },
  thoigiannhanhanghoan: {
    type: Date,
    alias: 'returnedAt'
  },
  thoigianhoantien: {
    type: Date,
    alias: 'refundedAt'
  },
  dahuyboibannguoidung: {
    type: Boolean,
    default: false,
    alias: 'canceledByUser'
  },
  thoigianhuyboibannguoidung: {
    type: Date,
    alias: 'canceledByUserAt'
  },
  hanhdongcuoi: {
    type: String,
    default: '',
    alias: 'lastAction'
  },
  nguoithuchiencuoi_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    default: null,
    alias: 'lastActorId'
  },
  vaitronguoithuchiencuoi: {
    type: String,
    default: '',
    alias: 'lastActorRole'
  },
  tennguoithuchiencuoi: {
    type: String,
    default: '',
    alias: 'lastActorName'
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
