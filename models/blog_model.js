const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  tieude: { type: String, trim: true, required: true },
  slug: { type: String, trim: true, required: true, unique: true },
  tomtat: { type: String, trim: true },
  noidung: { type: String },
  hinhanh: { type: String, trim: true },
  xuatban: { type: Boolean, default: false },
  ngayxuatban: { type: Date }
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

module.exports = mongoose.model('BlogPost', blogSchema, 'blog_posts');
