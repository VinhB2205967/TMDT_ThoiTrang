const mongoose = require('mongoose');

const flashSaleItemSchema = new mongoose.Schema({
  sanpham_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sanpham', required: true },
  giagiam: { type: Number },
  gioihan: { type: Number }
}, { _id: false });

const flashSaleSchema = new mongoose.Schema({
  ten: { type: String, trim: true, required: true },
  batdau: { type: Date, required: true },
  ketthuc: { type: Date, required: true },
  hienthi: { type: Boolean, default: true },
  phantramgiamgia: { type: Number, min: 1, max: 90, required: true },
  sanpham: [flashSaleItemSchema]
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

flashSaleSchema.index({ hienthi: 1, batdau: -1, ketthuc: -1 });
flashSaleSchema.index({ 'sanpham.sanpham_id': 1, batdau: 1, ketthuc: 1, hienthi: 1 });

flashSaleSchema.pre('validate', function normalizeFlashSale() {
  this.phantramgiamgia = Number(this.phantramgiamgia || 0);

  if (Array.isArray(this.sanpham)) {
    const seen = new Set();
    this.sanpham = this.sanpham
      .filter((item) => item && item.sanpham_id)
      .map((item) => ({
        sanpham_id: item.sanpham_id,
        giagiam: item.giagiam != null ? Number(item.giagiam) : undefined,
        gioihan: item.gioihan != null ? Number(item.gioihan) : undefined
      }))
      .filter((item) => {
        const key = String(item.sanpham_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
});

flashSaleSchema.pre('save', function validateDateRange() {
  if (!this.batdau || !this.ketthuc) return;
  if (new Date(this.ketthuc).getTime() <= new Date(this.batdau).getTime()) {
    throw new Error('Thời gian kết thúc phải lớn hơn bắt đầu');
  }
});

module.exports = mongoose.model('FlashSale', flashSaleSchema, 'flash_sales');
