const mongoose = require('mongoose');

function taoSlug(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const brandSchema = new mongoose.Schema({
  name: { type: String, trim: true, alias: 'ten_thuonghieu' },
  ten: { type: String, trim: true, required: true },
  slug: { type: String, trim: true, alias: 'duongdan' },
  normalizedName: { type: String, trim: true, alias: 'tenkhongdau' },
  logo: { type: String, trim: true, required: true, alias: 'anh_logo' },
  description: { type: String, trim: true, default: '', alias: 'mota_chitiet' },
  moTa: { type: String, trim: true, default: '' },

  isFeatured: { type: Boolean, default: false, alias: 'la_noibat' },
  noiBat: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, alias: 'kichhoat' },
  hienthi: { type: Boolean, default: true },
  order: { type: Number, default: 0, alias: 'thutu_hienthi' },
  thuTu: { type: Number, default: 0 },

  daXoa: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null, alias: 'ngayxoa' }
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

brandSchema.index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: {
      slug: { $exists: true, $type: 'string', $nin: [''] },
      daXoa: { $ne: true }
    }
  }
);

brandSchema.index(
  { normalizedName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      normalizedName: { $exists: true, $type: 'string', $nin: [''] },
      daXoa: { $ne: true }
    }
  }
);

brandSchema.index({ isActive: 1, isFeatured: 1, order: 1 });

brandSchema.pre('validate', function syncLegacyFields() {
  if (!this.name && this.ten) this.name = this.ten;
  if (!this.ten && this.name) this.ten = this.name;

  const ten = String(this.ten || this.name || '').trim();
  if (ten) {
    const normalized = ten
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
    this.normalizedName = normalized;
  }

  if (!this.slug || !String(this.slug).trim()) {
    this.slug = taoSlug(ten);
  } else {
    this.slug = taoSlug(this.slug);
  }

  if (this.order == null) this.order = Number(this.thuTu || 0);
  if (this.thuTu == null) this.thuTu = Number(this.order || 0);

  if (this.isFeatured == null) this.isFeatured = Boolean(this.noiBat);
  if (this.noiBat == null) this.noiBat = Boolean(this.isFeatured);
  this.isFeatured = Boolean(this.isFeatured);
  this.noiBat = Boolean(this.isFeatured);

  if (this.isActive == null) this.isActive = Boolean(this.hienthi);
  if (this.hienthi == null) this.hienthi = Boolean(this.isActive);
  this.isActive = Boolean(this.isActive);
  this.hienthi = Boolean(this.isActive);

  if (!this.moTa && this.description) this.moTa = this.description;
  if (!this.description && this.moTa) this.description = this.moTa;

});

module.exports = mongoose.model('Brand', brandSchema, 'brands');
