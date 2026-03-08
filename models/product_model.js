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
  soluong: Number,          
  sizes: [sizeSchema]       
}, { _id: true });

const productSchema = new mongoose.Schema({
  tensanpham: String,
  mota: String,
  mota_hinhanh: String,
  gia: Number,              
  phantramgiamgia: Number,  
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Danhmuc', default: null },
  sizeguide_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SizeGuide', default: null },
  occasion: { type: mongoose.Schema.Types.ObjectId, ref: 'Danhmuc', default: null },
  ageGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'Danhmuc', default: null },
  thuonghieu_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  luotmua: { type: Number, default: 0 },
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
  ngaytao: Date,
  ngaycapnhat: Date
});

productSchema.pre('validate', function syncLegacyFields() {
  if (!this.brand && this.thuonghieu_id) this.brand = this.thuonghieu_id;
  if (!this.thuonghieu_id && this.brand) this.thuonghieu_id = this.brand;
});

productSchema.index({ category: 1, trangthai: 1, daxoa: 1 });
productSchema.index({ occasion: 1, trangthai: 1, daxoa: 1 });
productSchema.index({ ageGroup: 1, trangthai: 1, daxoa: 1 });
productSchema.index({ brand: 1, trangthai: 1, daxoa: 1 });
productSchema.index({ gioitinh: 1, gia: 1 });


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
