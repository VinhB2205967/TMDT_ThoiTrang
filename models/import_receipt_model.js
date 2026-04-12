const mongoose = require('mongoose');

const importItemSchema = new mongoose.Schema(
  {
    chisoblock: { type: Number, required: false },
    sanphamid: { type: mongoose.Schema.Types.ObjectId, ref: 'Sanpham', required: true },
    orderitemid: { type: mongoose.Schema.Types.ObjectId, ref: 'Chitietdonhang', required: false },
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
  code: { type: String, alias: 'ma' },
  maphieu: { type: String, required: true, unique: true, index: true },
  ma_phieu: { type: String },
  loaiphieu: { type: String, enum: ['standard', 'return'], default: 'standard' },
  tenloaiphieu: { type: String, default: 'Nhập kho' },
  nguonnhap: { type: String, default: 'Nhập thủ công' },
  donhang_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Donhang', required: false, index: true },
  madonhang: { type: String, default: '' },
  phieuxuat_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PhieuXuatKho', required: false, index: true },
  maphieuxuat: { type: String, default: '' },
  ngaynhap: { type: Date, required: true },
  nhacungcap: { type: String, default: '' },
  ghichu: { type: String, default: '' },

  tongtiennhap: { type: Number, default: 0, min: 0 },

  chitiet: { type: [importItemSchema], default: [] },

  daxuatkho: { type: Boolean, default: false },
  ngayxuatkho: { type: Date, default: null },
  nguoixuatkho: { type: mongoose.Schema.Types.ObjectId, ref: 'Nguoidung', required: false },

  // Thông tin ký số/nhân viên thực hiện
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

const PhieuNhapKho = mongoose.model('PhieuNhapKho', importReceiptSchema, 'import_receipts');
module.exports = PhieuNhapKho;
