const mongoose = require("mongoose");

const fifoAllocationSchema = new mongoose.Schema({
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  soLuong: {
    type: Number,
    default: 0
  },
  giaNhap: {
    type: Number,
    default: 0
  },
  giaBanDeXuat: {
    type: Number,
    default: 0
  }
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  donhang_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Donhang",
    required: true
  },
  sanpham_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sanpham",
    required: true
  },
  bienthe_id: {                     // ID biến thể
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Lưu snapshot thông tin sản phẩm tại thời điểm đặt
  tensanpham: String,
  hinhanh: String,
  mausac: String,
  kichco: String,
  
  giagoc: Number,               
  giaban: Number,                   
  soluong: {
    type: Number,
    required: true,
    min: 1
  },
  thanhtien: Number,               
  fifoAllocations: {
    type: [fifoAllocationSchema],
    default: []
  },

  // Trạng thái sản phẩm trong đơn
  trangthai: {                      
    type: String,
    // Legacy values: 'pending', 'cancelled'
    // New values (Vietnamese tokens): 'choxuly', 'dahuy'
    enum: ['pending', 'cancelled', 'choxuly', 'dahuy'],
    default: "choxuly"
  },
  danhgia: {                        
    type: Boolean,
    default: false
  },

  ngaytao: {
    type: Date,
    default: Date.now
  }
});

// Tính thành tiền
orderItemSchema.pre('save', function() {
  if (!Number.isFinite(Number(this.thanhtien))) {
    this.thanhtien = (this.giaban || this.giagoc) * this.soluong;
  }
});

const Chitietdonhang = mongoose.model("Chitietdonhang", orderItemSchema, "order_items");
module.exports = Chitietdonhang;
