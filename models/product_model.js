const mongoose = require("mongoose");

// Schema cho size với số lượng
const sizeSchema = new mongoose.Schema({
  size: String,             
  soluong: Number           
}, { _id: false });

// Schema cho biến thể sản phẩm (theo màu sắc)
const bienTheSchema = new mongoose.Schema({
  mausac: String,           
  hinhanh: String,          
  gia: Number,              
  phantramgiamgia: Number,  
  soluong: Number,          // Số lượng (dùng cho sản phẩm không có size như túi, phụ kiện)
  sizes: [sizeSchema]       
}, { _id: true });

const productSchema = new mongoose.Schema({
  tensanpham: String,
  mota: String,
  gia: Number,              
  phantramgiamgia: Number,  
  mausac_chinh: String,    
  sizes: [sizeSchema],      
  soluong_chinh: Number,    // Số lượng chính (cho sản phẩm không có size như túi, phụ kiện)
  soluongton: Number,      
  gioitinh: String,
  loaisanpham: String,
  bienthe: [bienTheSchema], // Danh sách biến thể theo màu
  hinhanh: String,          // Hình ảnh đại diện chính
  trangthai: String,
  daxoa: Boolean,
  ngaytao: Date
});


// Virtual: Giá mới sau giảm giá
productSchema.virtual('giaMoi').get(function() {
  if (this.phantramgiamgia > 0) {
    return Math.round(this.gia * (1 - this.phantramgiamgia / 100));
  }
  return this.gia;
});

// Bật virtuals khi dùng .lean() hoặc toObject()
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

const Sanpham = mongoose.model("Sanpham", productSchema, "products");
module.exports = Sanpham;
