const mongoose = require("mongoose");

// Schema cho size với số lượng
const sizeSchema = new mongoose.Schema({
  size: String,             // Tên size: "XS", "S", "M", "L", "XL", "XXL"
  soluong: Number           // Số lượng của size này
}, { _id: false });

// Schema cho biến thể sản phẩm (theo màu sắc)
const bienTheSchema = new mongoose.Schema({
  mausac: String,           // Tên màu: "Đỏ", "Xanh", "Đen"...
  hinhanh: String,          // Hình ảnh riêng cho màu này
  gia: Number,              // Giá riêng cho màu này (nếu null thì dùng giá gốc)
  phantramgiamgia: Number,  // Giảm giá riêng cho màu này
  sizes: [sizeSchema]       // Danh sách size với số lượng riêng
}, { _id: true });

const productSchema = new mongoose.Schema({
  tensanpham: String,
  mota: String,
  gia: Number,              // Giá gốc (mặc định nếu biến thể không có giá riêng)
  phantramgiamgia: Number,  // Giảm giá gốc
  mausac_chinh: String,     // Màu sắc của sản phẩm chính (ảnh đại diện)
  sizes: [sizeSchema],      // Danh sách size với số lượng (sản phẩm gốc)
  soluongton: Number,       // Tổng số lượng = tổng sizes gốc + tổng sizes biến thể
  gioitinh: String,
  loaisanpham: String,
  bienthe: [bienTheSchema], // Danh sách biến thể theo màu
  hinhanh: String,          // Hình ảnh đại diện chính
  trangthai: String,
  daxoa: Boolean,
  ngaytao: Date
});

const Sanpham = mongoose.model("Sanpham", productSchema, "products");
module.exports = Sanpham;
