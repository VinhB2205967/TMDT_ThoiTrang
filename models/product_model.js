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
  danhmuc_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Danhmuc', default: null },
  sizeguide_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SizeGuide', default: null },
  bangsize_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SizeGuide', default: null },
  occasion: { type: mongoose.Schema.Types.ObjectId, ref: 'Danhmuc', default: null },
  dip_sudung_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Danhmuc', default: null },
  ageGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'Danhmuc', default: null },
  nhomtuoi_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Danhmuc', default: null },
  thuonghieu_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  thuonghieu: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
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
  if (!this.thuonghieu && this.brand) this.thuonghieu = this.brand;
  if (!this.brand && this.thuonghieu) this.brand = this.thuonghieu;
  if (!this.thuonghieu_id && this.thuonghieu) this.thuonghieu_id = this.thuonghieu;
  if (!this.thuonghieu && this.thuonghieu_id) this.thuonghieu = this.thuonghieu_id;

  if (!this.danhmuc_id && this.category) this.danhmuc_id = this.category;
  if (!this.category && this.danhmuc_id) this.category = this.danhmuc_id;

  if (!this.bangsize_id && this.sizeguide_id) this.bangsize_id = this.sizeguide_id;
  if (!this.sizeguide_id && this.bangsize_id) this.sizeguide_id = this.bangsize_id;

  if (!this.dip_sudung_id && this.occasion) this.dip_sudung_id = this.occasion;
  if (!this.occasion && this.dip_sudung_id) this.occasion = this.dip_sudung_id;

  if (!this.nhomtuoi_id && this.ageGroup) this.nhomtuoi_id = this.ageGroup;
  if (!this.ageGroup && this.nhomtuoi_id) this.ageGroup = this.nhomtuoi_id;
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
