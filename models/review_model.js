const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  sanpham_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sanpham",
    required: true
  },
  nguoidung_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Nguoidung",
    required: true
  },
  donhang_id: {                     // Đơn hàng liên quan (để verify đã mua)
    type: mongoose.Schema.Types.ObjectId,
    ref: "Donhang"
  },
  chitietdonhang_id: {              // Chi tiết đơn hàng
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chitietdonhang"
  },
  
  diem: {                           // Điểm đánh giá 1-5 sao
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  tieude: String,                   // Tiêu đề đánh giá
  noidung: String,                  // Nội dung đánh giá chi tiết
  hinhanh: [String],                // Danh sách ảnh đánh giá
  
  // Thông tin sản phẩm đã mua
  mausac: String,
  kichco: String,
  
  // Phản hồi từ admin/shop
  phanhoi: {
    noidung: String,
    nguoiphanhoi: String,           // Tên admin phản hồi
    ngayphanhoi: Date
  },
  
  thich: {                          // Số lượt thích
    type: Number,
    default: 0
  },
  
  trangthai: {                      // pending, approved, rejected
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  hienthi: {                        // Hiển thị công khai
    type: Boolean,
    default: true
  },
  daxoa: {
    type: Boolean,
    default: false
  },
  
  ngaytao: {
    type: Date,
    default: Date.now
  },
  ngaycapnhat: Date
});

// Index để tìm kiếm nhanh
reviewSchema.index({ sanpham_id: 1, nguoidung_id: 1 });
reviewSchema.index({ diem: 1 });

const Danhgia = mongoose.model("Danhgia", reviewSchema, "reviews");
module.exports = Danhgia;
