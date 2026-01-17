const Giohang = require('../models/cart_model');

async function attachCartCount(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      res.locals.cartCount = 0;
      return next();
    }

    const cart = await Giohang.findOne({ nguoidung_id: req.user._id }).select('sanpham').lean();
    res.locals.cartCount = cart && Array.isArray(cart.sanpham) ? cart.sanpham.length : 0;
    return next();
  } catch {
    res.locals.cartCount = 0;
    return next();
  }
}

module.exports = {
  attachCartCount
};
