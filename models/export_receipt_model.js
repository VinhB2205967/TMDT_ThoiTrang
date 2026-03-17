const mongoose = require('mongoose');

const exportAllocationSchema = new mongoose.Schema(
  {
    lotId: { type: mongoose.Schema.Types.ObjectId, required: false },
    soLuong: { type: Number, required: true, min: 1 },
    giaNhap: { type: Number, default: 0, min: 0 },
    giaBanDeXuat: { type: Number, default: 0, min: 0 },
    giaban: { type: Number, default: 0, min: 0 },
    phantramgiam: { type: Number, default: 0, min: 0 },
    giasaugiam: { type: Number, default: 0, min: 0 },
    doanhthu: { type: Number, default: 0 },
    giavon: { type: Number, default: 0 },
    loinhuan: { type: Number, default: 0 }
  },
  { _id: false }
);

const exportItemSchema = new mongoose.Schema(
  {
    sanphamid: { type: mongoose.Schema.Types.ObjectId, ref: 'Sanpham', required: true },
    tensanpham: { type: String, default: '' },
    bientheid: { type: mongoose.Schema.Types.ObjectId, required: false },
    kichco: { type: String, default: '' },
    mausac: { type: String, default: '' },
    soluong: { type: Number, required: true, min: 1 },
    gianhap: { type: Number, default: 0, min: 0 },
    giaban: { type: Number, default: 0, min: 0 },
    phantramgiam: { type: Number, default: 0, min: 0 },
    giasaugiam: { type: Number, default: 0, min: 0 },
    doanhthu: { type: Number, default: 0 },
    giavon: { type: Number, default: 0 },
    loinhuan: { type: Number, default: 0 },
    allocations: { type: [exportAllocationSchema], default: [] },
    hinhanh: { type: String, default: '' },
    ghichudong: { type: String, default: '' }
  },
  { _id: false }
);

const exportReceiptSchema = new mongoose.Schema({
  maphieu: { type: String, required: true, unique: true, index: true },
  donhang_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Donhang', index: true, unique: true, sparse: true },
  madonhang: { type: String, default: '' },
  ngayxuat: { type: Date, required: true },
  noinhan: { type: String, default: '' },
  lydo: { type: String, default: '' },
  tongsoluong: { type: Number, default: 0, min: 0 },
  tongdoanhthu: { type: Number, default: 0 },
  tonggiavon: { type: Number, default: 0 },
  tongloinhuan: { type: Number, default: 0 },
  tysuatloinhuan: { type: Number, default: 0 },
  nguoitaophieu: { type: String, enum: ['manual', 'order'], default: 'manual' },
  chitiet: { type: [exportItemSchema], default: [] },

  nhanvienky: {
    tennhanvien: { type: String, default: '' },
    idnhanvien: { type: String, default: '' },
    anhchuky: { type: String, default: '' },
    thoigianky: { type: Date }
  },

  nguoitao: { type: mongoose.Schema.Types.ObjectId, ref: 'Nguoidung', required: false },
  ngaytao: { type: Date, default: Date.now },
  ngaycapnhat: { type: Date, default: Date.now }
});

const PhieuXuatKho = mongoose.model('PhieuXuatKho', exportReceiptSchema, 'export_receipts');
module.exports = PhieuXuatKho;
