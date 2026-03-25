const cartService = require('../../services/cart');

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
    return res.redirect(cartService.resolveRedirectResult(result, '/cart'));
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
    return res.redirect(cartService.resolveRedirectResult(result, '/cart/checkout'));
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
    cartService.applyFlashMessage(req.flash, result.flash);
    return res.redirect(cartService.resolveRedirectResult(result, '/cart'));
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
    return res.redirect(cartService.resolveRedirectResult(result, '/cart'));
  } catch {
    return res.redirect('/cart');
  }
};

module.exports.xoa = async (req, res) => {
  try {
    await cartService.removeCartItem({
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

    cartService.applyFlashMessage(req.flash, result.flash);

    if (result.json) {
      return res.status(result.status || 200).json(result.json);
    }

    return res.redirect(result.redirect || '/orders');
  } catch (error) {
    const message = cartService.resolveServiceErrorMessage(error, 'Có lỗi xảy ra');
    req.flash?.('error', message);
    return res.redirect('/cart/checkout');
  }
};

module.exports.momoReturn = async (req, res) => {
  try {
    const result = await cartService.handleMoMoReturn({ query: req.query });
    cartService.applyFlashMessage(req.flash, result.flash);
    return res.redirect(result.redirect || '/orders');
  } catch {
    req.flash?.('error', 'Có lỗi khi xử lý thanh toán MoMo');
    return res.redirect('/orders');
  }
};

module.exports.momoIpn = async (req, res) => {
  try {
    const result = await cartService.handleMoMoIpn({ body: req.body });
    const normalized = cartService.resolveJsonResult(result, { status: 200, json: { success: true } });
    return res.status(normalized.status).json(normalized.json);
  } catch {
    return res.status(200).json({ success: false });
  }
};

module.exports.vnpayReturn = async (req, res) => {
  try {
    const result = await cartService.handleVnpayReturn({ query: req.query });
    cartService.applyFlashMessage(req.flash, result.flash);
    return res.redirect(result.redirect || '/orders');
  } catch {
    req.flash?.('error', 'Có lỗi khi xử lý thanh toán VNPAY');
    return res.redirect('/orders');
  }
};

module.exports.vnpayIpn = async (req, res) => {
  try {
    const result = await cartService.handleVnpayIpn({ query: req.query, body: req.body });
    const normalized = cartService.resolveJsonResult(result, { status: 200, json: { RspCode: '00', Message: 'Success' } });
    return res.status(normalized.status).json(normalized.json);
  } catch {
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
};
