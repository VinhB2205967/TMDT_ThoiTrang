const Giohang = require('../models/cart_model');

function normalizeImage(path) {
  if (!path) return '/images/shopping.png';
  if (path.startsWith('/public')) return path.replace('/public', '');
  return path;
}

async function getOrCreateCart(userId) {
  let cart = await Giohang.findOne({ nguoidung_id: userId });
  if (!cart) cart = await Giohang.create({ nguoidung_id: userId, sanpham: [] });
  return cart;
}

module.exports = {
  getOrCreateCart,
  normalizeImage
};
