const mongoose = require('mongoose');

const orderStatusLogSchema = new mongoose.Schema({
  donhang_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donhang',
    required: true,
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
  trangthai_cu: {
    type: String,
    default: ''
  },
  trangthai_moi: {
    type: String,
    required: true,
    index: true
  },
  hanhdong: {
    type: String,
    default: '',
    index: true
  },
  ghichu: {
    type: String,
    default: ''
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    alias: 'nguoithuchien_id',
    default: null
  },
  actorRole: {
    type: String,
    alias: 'vaitronguoithuchien',
    default: ''
  },
  actorName: {
    type: String,
    alias: 'tennguoithuchien',
    default: ''
  },
  uniqueKey: {
    type: String,
    alias: 'khoachinh',
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    alias: 'thongtin',
    default: {}
  },
  ngaytao: {
    type: Date,
    default: Date.now,
    index: true
  }
});

orderStatusLogSchema.index({ donhang_id: 1, ngaytao: -1 });
orderStatusLogSchema.index({ donhang_id: 1, trangthai_moi: 1, ngaytao: -1 });
orderStatusLogSchema.index({ uniqueKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('OrderStatusLog', orderStatusLogSchema, 'order_status_logs');
