const mongoose = require('mongoose');

const inventoryLotSchema = new mongoose.Schema({
  phieunhap_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PhieuNhapKho', required: true, index: true },
  maphieunhap: { type: String, default: '', index: true },
  ngaynhap: { type: Date, required: true, index: true },
  nhacungcap: { type: String, default: '' },

  sanphamid: { type: mongoose.Schema.Types.ObjectId, ref: 'Sanpham', required: true, index: true },
  bientheid: { type: mongoose.Schema.Types.ObjectId, required: false, index: true },
  kichco: { type: String, default: '', index: true },
  mausac: { type: String, default: '' },

  gianhap: { type: Number, default: 0, min: 0 },
  giabandexuat: { type: Number, default: 0, min: 0 },

  soluongnhap: { type: Number, required: true, min: 1 },
  soluongconlai: { type: Number, required: true, min: 0 },

  ngaytao: { type: Date, default: Date.now },
  ngaycapnhat: { type: Date, default: Date.now }
});

inventoryLotSchema.index({ sanphamid: 1, bientheid: 1, kichco: 1, ngaynhap: 1, ngaytao: 1 });

const TonKhoLo = mongoose.model('TonKhoLo', inventoryLotSchema, 'inventory_lots');
module.exports = TonKhoLo;
