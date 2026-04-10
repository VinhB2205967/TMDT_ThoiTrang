const mongoose = require('mongoose');

function toSlug(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const lookbookSchema = new mongoose.Schema({
  title: { type: String, trim: true, required: true },
  slug: { type: String, trim: true },
  image: { type: String, trim: true, required: true },
  description: { type: String, trim: true, default: '' },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sanpham', required: true }],
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  noiBat: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  startDate: { type: Date, alias: 'ngaybatdau', default: null },
  endDate: { type: Date, alias: 'ngayketthuc', default: null },
  deletedAt: { type: Date, alias: 'ngayxoa', default: null },

  tenmua: { type: String, trim: true },
  hinhanh: { type: String, trim: true },
  mota: { type: String, trim: true },
  sanpham_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sanpham' }],
  thuTu: { type: Number },
  hienthi: { type: Boolean }
}, {
  timestamps: true
});

lookbookSchema.index({ order: 1, isActive: 1 });
lookbookSchema.index({ slug: 1 }, { unique: true });

lookbookSchema.path('products').validate(function validateProducts(val) {
  return Array.isArray(val) && val.length > 0;
}, 'Lookbook phải có ít nhất 1 sản phẩm');

lookbookSchema.pre('validate', async function autoSlug() {
  if (!this.title && this.tenmua) this.title = this.tenmua;
  if (!this.tenmua && this.title) this.tenmua = this.title;

  if (!this.image && this.hinhanh) this.image = this.hinhanh;
  if (!this.hinhanh && this.image) this.hinhanh = this.image;

  if (!this.description && this.mota) this.description = this.mota;
  if (!this.mota && this.description) this.mota = this.description;

  if ((!Array.isArray(this.products) || this.products.length === 0) && Array.isArray(this.sanpham_ids) && this.sanpham_ids.length) {
    this.products = this.sanpham_ids
      .map((item) => (item && item._id ? item._id : item))
      .filter(Boolean);
  }

  if ((!Array.isArray(this.sanpham_ids) || this.sanpham_ids.length === 0) && Array.isArray(this.products) && this.products.length) {
    this.sanpham_ids = this.products
      .map((item) => (item && item._id ? item._id : item))
      .filter(Boolean);
  }

  if (this.order === undefined || this.order === null) this.order = Number(this.thuTu || 0);
  if (this.thuTu === undefined || this.thuTu === null) this.thuTu = Number(this.order || 0);
  this.order = Number(this.order || 0);
  this.thuTu = Number(this.order || 0);

  if (this.isActive === undefined || this.isActive === null) this.isActive = Boolean(this.hienthi);
  if (this.hienthi === undefined || this.hienthi === null) this.hienthi = Boolean(this.isActive);
  this.isActive = Boolean(this.isActive);
  this.hienthi = Boolean(this.isActive);

  if (this.noiBat === undefined || this.noiBat === null) this.noiBat = Boolean(this.isFeatured);
  if (this.isFeatured === undefined || this.isFeatured === null) this.isFeatured = Boolean(this.noiBat);
  this.noiBat = Boolean(this.noiBat);
  this.isFeatured = Boolean(this.noiBat);

  if (!this.isModified('title') && this.slug) return;

  const base = toSlug(this.title || this.slug || 'lookbook');
  if (!base) {
    this.slug = undefined;
    return;
  }

  const Model = this.constructor;
  let candidate = base;
  let counter = 1;

  while (await Model.exists({ slug: candidate, _id: { $ne: this._id } })) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }

  this.slug = candidate;
  return;
});

lookbookSchema.virtual('ngaytao').get(function getNgayTao() {
  return this.createdAt;
});

lookbookSchema.virtual('ngaycapnhat').get(function getNgayCapNhat() {
  return this.updatedAt;
});

lookbookSchema.set('toJSON', { virtuals: true });
lookbookSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Lookbook', lookbookSchema, 'lookbooks');
