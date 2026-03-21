const cartService = require('../../../services/cart');

module.exports.them = async (req, res) => {
  try {
    const result = await cartService.addToCart({
      userId: req.user._id,
      body: req.body
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }

    return res.json({ success: true, cartCount: result.cartCount });
  } catch {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.muaNgay = async (req, res) => {
  try {
    const result = await cartService.buyNowFromProduct({
      userId: req.user._id,
      body: req.body
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }

    return res.json({
      success: true,
      cartCount: result.cartCount,
      redirect: result.redirect
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.capNhatSoLuong = async (req, res) => {
  try {
    const result = await cartService.updateCartItemQuantity({
      userId: req.user._id,
      body: req.body
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }

    return res.json(result.payload || { success: true });
  } catch {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.capNhatTuyChon = async (req, res) => {
  try {
    const result = await cartService.updateCartItemOptions({
      userId: req.user._id,
      body: req.body
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message || 'Có lỗi xảy ra' });
    }

    return res.json(result.payload || { success: true });
  } catch {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await cartService.removeCartItem({
      userId: req.user._id,
      itemId: req.body.itemId
    });

    return res.json(result);
  } catch {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.xoaHet = async (req, res) => {
  try {
    const result = await cartService.clearCart({ userId: req.user._id });
    return res.json(result);
  } catch {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};
