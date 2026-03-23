const mongoose = require('mongoose');

const adjustmentLineSchema = new mongoose.Schema({
  sanphamid: { type: mongoose.Schema.Types.ObjectId, ref: 'Sanpham', required: true },
  tensanpham: { type: String, default: '' },
  bientheid: { type: mongoose.Schema.Types.ObjectId, required: false },
  kichco: { type: String, default: '' },
  mausac: { type: String, default: '' },
  soluongdieuchinh: { type: Number, required: true },
  tontruoc: { type: Number, default: null },
  tonsau: { type: Number, default: null }
}, { _id: false });

const inventoryAdjustmentSchema = new mongoose.Schema({
  maphieu: { type: String, required: true, unique: true, index: true },
  loaiphieu: { type: String, enum: ['increase', 'decrease'], required: true },
  lydo: { type: String, default: '' },
  daxacnhan: { type: Boolean, default: false, index: true },
  ngayxacnhan: { type: Date, default: null },
  nguoixacnhan: { type: mongoose.Schema.Types.ObjectId, ref: 'Nguoidung', required: false },
  chitiet: { type: [adjustmentLineSchema], default: [] },
  nguoitao: { type: mongoose.Schema.Types.ObjectId, ref: 'Nguoidung', required: false },
  ngaytao: { type: Date, default: Date.now },
  ngaycapnhat: { type: Date, default: Date.now }
});

const PhieuDieuChinhKho = mongoose.model('PhieuDieuChinhKho', inventoryAdjustmentSchema, 'inventory_adjustments');
module.exports = PhieuDieuChinhKho;
