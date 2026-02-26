const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  ten: { type: String, trim: true, required: true },
  logo: { type: String, trim: true, required: true },
  hienthi: { type: Boolean, default: true },
  noiBat: { type: Boolean, default: false },
  thuTu: { type: Number, default: 0 }
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

module.exports = mongoose.model('Brand', brandSchema, 'brands');
