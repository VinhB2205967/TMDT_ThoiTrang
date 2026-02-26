const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  tieude: { type: String, trim: true },
  mota: { type: String, trim: true },
  hinhanh: { type: String, trim: true, required: true },
  nut_text: { type: String, trim: true },
  nut_link: { type: String, trim: true },
  loai: {
    type: String,
    enum: ['collection', 'sale', 'lookbook', 'general'],
    default: 'general'
  },
  hienthi: { type: Boolean, default: true },
  thuTu: { type: Number, default: 0 }
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

module.exports = mongoose.model('Banner', bannerSchema, 'banners');
