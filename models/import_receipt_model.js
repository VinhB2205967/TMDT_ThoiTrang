const mongoose = require('mongoose');

const importItemSchema = new mongoose.Schema(
  {
    chisoblock: { type: Number, required: false },
    sanphamid: { type: mongoose.Schema.Types.ObjectId, ref: 'Sanpham', required: true },
    tensanpham: { type: String },
    masku: { type: String },

    // For display/auditing
    danhmuc: { type: String },
    chatlieu: { type: String },
    hinhanh: { type: String },

    // Variant target
    bientheid: { type: mongoose.Schema.Types.ObjectId, required: false }, // null = sản phẩm chính
    kichco: { type: String },
    mausac: { type: String },

    soluong: { type: Number, required: true, min: 1 },
    gianhap: { type: Number, default: 0, min: 0 },
    giabandexuat: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const importReceiptSchema = new mongoose.Schema({
  code: { type: String },
  maphieu: { type: String, required: true, unique: true, index: true },
  ma_phieu: { type: String },
  ngaynhap: { type: Date, required: true },
  nhacungcap: { type: String, default: '' },
  ghichu: { type: String, default: '' },

  tongtiennhap: { type: Number, default: 0, min: 0 },

  chitiet: { type: [importItemSchema], default: [] },

  nguoitao: { type: mongoose.Schema.Types.ObjectId, required: false },
  ngaytao: { type: Date, default: Date.now },
  ngaycapnhat: { type: Date, default: Date.now }
});

const PhieuNhapKho = mongoose.model('PhieuNhapKho', importReceiptSchema, 'import_receipts');
module.exports = PhieuNhapKho;
