const Giohang = require('../models/cart_model');

async function ganSoLuongGioHang(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      res.locals.cartCount = 0;
      return next();
    }

    const gioHang = await Giohang.findOne({ nguoidung_id: req.user._id }).select('sanpham').lean();
    res.locals.cartCount = gioHang && Array.isArray(gioHang.sanpham) ? gioHang.sanpham.length : 0;
    return next();
  } catch {
    res.locals.cartCount = 0;
    return next();
  }
}

module.exports = {
  // Giữ tương thích tên cũ
  attachCartCount: ganSoLuongGioHang,
  // Alias tiếng Việt
  ganSoLuongGioHang
};
