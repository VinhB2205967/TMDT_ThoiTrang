const mongoose = require("mongoose");

// Schema cho biến thể sản phẩm (theo màu sắc)
const bienTheSchema = new mongoose.Schema({
  mausac: String,           // Tên màu: "Đỏ", "Xanh", "Đen"...
  hinhanh: String,          // Hình ảnh riêng cho màu này
  gia: Number,              // Giá riêng cho màu này (nếu null thì dùng giá gốc)
  phantramgiamgia: Number,  // Giảm giá riêng cho màu này
  soluongton: Number        // Số lượng tồn kho của màu này
}, { _id: true });

const productSchema = new mongoose.Schema({
  tensanpham: String,
  mota: String,
  gia: Number,              // Giá gốc (mặc định nếu biến thể không có giá riêng)
  phantramgiamgia: Number,  // Giảm giá gốc
  soluongton: Number,       // Tổng số lượng (có thể tính từ biến thể)
  gioitinh: String,
  loaisanpham: String,
  size: Array,
  bienthe: [bienTheSchema], // Danh sách biến thể theo màu
  hinhanh: String,          // Hình ảnh đại diện chính
  trangthai: String,
  daxoa: Boolean,
  ngaytao: Date
});

const Sanpham = mongoose.model("Sanpham", productSchema, "products");
module.exports = Sanpham;
