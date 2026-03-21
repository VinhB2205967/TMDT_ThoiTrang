const cartService = require('../../services/cart');

function applyFlash(req, flash) {
  if (!flash) return;
  req.flash?.(flash.type || 'info', flash.message || '');
}

function resolveErrorMessage(error, fallback) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || fallback;
}

module.exports.danhSach = async (req, res) => {
  try {
    const { cart, fifoPriceNotice } = await cartService.getCartPageData({
      userId: req.user._id
    });

    return res.render('client/pages/cart/index.pug', {
      titlePage: 'Giỏ hàng',
      cart,
      fifoPriceNotice
    });
  } catch {
    req.flash?.('error', 'Không thể tải giỏ hàng. Vui lòng thử lại.');
    return res.redirect('/');
  }
};

module.exports.them = async (req, res) => {
  try {
    const result = await cartService.addToCart({
      userId: req.user._id,
      body: req.body
    });

    if (!result.ok) {
      return res.redirect(result.redirect || '/products');
    }

    return res.redirect(result.redirect || '/cart');
  } catch {
    return res.redirect('/cart');
  }
};

module.exports.muaNgay = async (req, res) => {
  try {
    const result = await cartService.buyNowFromProduct({
      userId: req.user._id,
      body: req.body
    });

    if (!result.ok) {
      return res.redirect(result.redirect || '/products');
    }

    return res.redirect(result.redirect || '/cart/checkout');
  } catch {
    return res.redirect('/cart');
  }
};

module.exports.capNhatSoLuong = async (req, res) => {
  try {
    const result = await cartService.updateCartItemQuantity({
      userId: req.user._id,
      body: req.body
    });

    if (!result.ok) {
      return res.redirect(result.redirect || '/cart');
    }

    return res.redirect(result.redirect || '/cart');
  } catch {
    return res.redirect('/cart');
  }
};

module.exports.capNhatTuyChon = async (req, res) => {
  try {
    const result = await cartService.updateCartItemOptions({
      userId: req.user._id,
      body: req.body
    });

    if (!result.ok) {
      return res.redirect('/cart');
    }

    return res.redirect('/cart');
  } catch {
    return res.redirect('/cart');
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await cartService.removeCartItem({
      userId: req.user._id,
      itemId: req.body.itemId
    });

    return res.redirect('/cart');
  } catch {
    return res.redirect('/cart');
  }
};

module.exports.xoaHet = async (req, res) => {
  try {
    await cartService.clearCart({ userId: req.user._id });
    return res.redirect('/cart');
  } catch {
    return res.redirect('/cart');
  }
};

module.exports.trangThanhToan = async (req, res) => {
  try {
    const data = await cartService.getCheckoutPageData({
      userId: req.user._id,
      itemIdsQuery: req.query.itemIds
    });

    return res.render('client/pages/cart/checkout.pug', {
      titlePage: 'Thanh toán',
      ...data
    });
  } catch {
    req.flash?.('error', 'Không thể tải trang thanh toán. Vui lòng thử lại.');
    return res.redirect('/cart');
  }
};

module.exports.xuLyThanhToan = async (req, res) => {
  try {
    const result = await cartService.processCheckout({
      userId: req.user._id,
      body: req.body,
      protocol: req.protocol,
      host: req.get('host'),
      headers: req.headers,
      socketRemoteAddress: req.socket?.remoteAddress,
      ip: req.ip
    });

    applyFlash(req, result.flash);

    if (result.json) {
      return res.status(result.status || 200).json(result.json);
    }

    return res.redirect(result.redirect || '/orders');
  } catch (error) {
    const message = resolveErrorMessage(error, 'Có lỗi xảy ra');
    req.flash?.('error', message);
    return res.redirect('/cart/checkout');
  }
};

module.exports.momoReturn = async (req, res) => {
  try {
    const result = await cartService.handleMoMoReturn({ query: req.query });
    applyFlash(req, result.flash);
    return res.redirect(result.redirect || '/orders');
  } catch {
    req.flash?.('error', 'Có lỗi khi xử lý thanh toán MoMo');
    return res.redirect('/orders');
  }
};

module.exports.momoIpn = async (req, res) => {
  try {
    const result = await cartService.handleMoMoIpn({ body: req.body });
    return res.status(result.status || 200).json(result.json || { success: true });
  } catch {
    return res.status(200).json({ success: false });
  }
};

module.exports.vnpayReturn = async (req, res) => {
  try {
    const result = await cartService.handleVnpayReturn({ query: req.query });
    applyFlash(req, result.flash);
    return res.redirect(result.redirect || '/orders');
  } catch {
    req.flash?.('error', 'Có lỗi khi xử lý thanh toán VNPAY');
    return res.redirect('/orders');
  }
};

module.exports.vnpayIpn = async (req, res) => {
  try {
    const result = await cartService.handleVnpayIpn({ query: req.query, body: req.body });
    return res.status(result.status || 200).json(result.json || { RspCode: '00', Message: 'Success' });
  } catch {
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
};
