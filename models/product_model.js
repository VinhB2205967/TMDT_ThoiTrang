const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  tensanpham: String,
  mota: String,
  gia: Number,
  phantramgiamgia: Number,
  soluongton: Number,
  gioitinh: String,
  loaisanpham: String,
  size: Array,
  mausac: Array,
  hinhanh: String,
  trangthai: String,
  vitrihienthi: Number,
  daxoa: Boolean,
  ngaytao: Date
});

const Sanpham = mongoose.model("Sanpham", productSchema, "sanphams");
module.exports = Sanpham;
