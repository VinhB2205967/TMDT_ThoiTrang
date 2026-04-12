const mongoose = require('mongoose');

const sizeGuideRowSchema = new mongoose.Schema(
  {
    size: { type: String, required: true, trim: true, alias: 'kichco' },
    giatri: { type: [String], default: [] }
  },
  { _id: false }
);

const sizeGuideSchema = new mongoose.Schema({
  tenbang: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, unique: true, index: true, alias: 'duongdan' },
  loaisanpham: { type: String, required: true, trim: true, index: true },
  cot: { type: [String], default: [] },
  dong: { type: [sizeGuideRowSchema], default: [] },
  goiy: { type: String, default: '' },
  daxoa: { type: Boolean, default: false },
  ngaytao: { type: Date, default: Date.now },
  ngaycapnhat: { type: Date, default: Date.now }
});

sizeGuideSchema.index({ loaisanpham: 1, daxoa: 1, ngaycapnhat: -1 });

const SizeGuide = mongoose.model('SizeGuide', sizeGuideSchema, 'size_guides');
module.exports = SizeGuide;
