const mongoose = require('mongoose');

const homeSectionSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, alias: 'khoa' },
  tieuDe: { type: String, trim: true },
  hienthi: { type: Boolean, default: true },
  thuTu: { type: Number, default: 0 },
  config: { type: Object, default: {}, alias: 'cauhinh' }
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

module.exports = mongoose.model('HomeSection', homeSectionSchema, 'home_sections');

