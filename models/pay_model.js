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
  magiaodich: String,               
  phuongthuc: {                    
    type: String,
    required: true
  },
  sotien: {
    type: Number,
    required: true
  },
  trangthai: {                      
    type: String,
    enum: ['pending', 'success', 'failed', 'refunded', 'choduyet', 'thanhcong', 'thatbai', 'hoantien'],
    default: 'choduyet'
  },
  // Thông tin chi tiết thanh toán
  chitiet: {
    nganhang: String,               
    sotaikhoan: String,
    tennguoichuyen: String,
    noidung: String,                
    anhchungtu: String              
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
