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
  phantramgiamgia: { type: Number, default: 0 },
  sanpham: [flashSaleItemSchema]
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

module.exports = mongoose.model('FlashSale', flashSaleSchema, 'flash_sales');
