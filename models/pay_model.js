const mongoose = require("mongoose");

const paySchema = new mongoose.Schema({
  donhang_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Donhang",
    required: true
  },
  nguoidung_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Nguoidung",
    required: true
  },
  magiaodich: String,               // Mã giao dịch từ cổng thanh toán
  phuongthuc: {                     // cod, banking, momo, vnpay, zalopay
    type: String,
    required: true
  },
  sotien: {
    type: Number,
    required: true
  },
  trangthai: {                      // pending, success, failed, refunded
    type: String,
    enum: ['pending', 'success', 'failed', 'refunded'],
    default: 'pending'
  },
  // Thông tin chi tiết thanh toán
  chitiet: {
    nganhang: String,               // Tên ngân hàng (nếu banking)
    sotaikhoan: String,
    tennguoichuyen: String,
    noidung: String,                // Nội dung chuyển khoản
    anhchungtu: String              // Ảnh chứng từ (nếu có)
  },
  // Response từ cổng thanh toán
  response: {
    type: mongoose.Schema.Types.Mixed
  },
  ghichu: String,
  
  ngaytao: {
    type: Date,
    default: Date.now
  },
  ngaycapnhat: Date
});

const Thanhtoan = mongoose.model("Thanhtoan", paySchema, "pays");
module.exports = Thanhtoan;
