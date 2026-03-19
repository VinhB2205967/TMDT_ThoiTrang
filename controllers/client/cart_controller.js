const { muonJSON } = require('../../helpers/http');
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
      titlePage: 'Gi? h�ng',
      cart,
      fifoPriceNotice
    });
  } catch {
    req.flash?.('error', 'Kh�ng th? t?i gi? h�ng. Vui l�ng th? l?i.');
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
      if (muonJSON(req)) return res.status(result.status || 400).json({ success: false, message: result.message });
      return res.redirect(result.redirect || '/products');
    }

    if (muonJSON(req)) return res.json({ success: true, cartCount: result.cartCount });
    return res.redirect(result.redirect || '/cart');
  } catch {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'C� l?i x?y ra' });
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
      if (muonJSON(req)) return res.status(result.status || 400).json({ success: false, message: result.message });
      return res.redirect(result.redirect || '/products');
    }

    if (muonJSON(req)) {
      return res.json({
        success: true,
        cartCount: result.cartCount,
        redirect: result.redirect
      });
    }

    return res.redirect(result.redirect || '/cart/checkout');
  } catch {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'C� l?i x?y ra' });
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
      if (muonJSON(req)) return res.status(result.status || 400).json({ success: false, message: result.message });
      return res.redirect(result.redirect || '/cart');
    }

    if (muonJSON(req)) return res.json(result.payload || { success: true });
    return res.redirect(result.redirect || '/cart');
  } catch {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'C� l?i x?y ra' });
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
      return res.status(result.status || 400).json({ success: false, message: result.message || 'C� l?i x?y ra' });
    }

    return res.json(result.payload || { success: true });
  } catch {
    return res.status(500).json({ success: false, message: 'C� l?i x?y ra' });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await cartService.removeCartItem({
      userId: req.user._id,
      itemId: req.body.itemId
    });

    return muonJSON(req) ? res.json(result) : res.redirect('/cart');
  } catch {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'C� l?i x?y ra' });
    return res.redirect('/cart');
  }
};

module.exports.xoaHet = async (req, res) => {
  try {
    const result = await cartService.clearCart({ userId: req.user._id });
    return muonJSON(req) ? res.json(result) : res.redirect('/cart');
  } catch {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'C� l?i x?y ra' });
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
      titlePage: 'Thanh to�n',
      ...data
    });
  } catch {
    req.flash?.('error', 'Kh�ng th? t?i trang thanh to�n. Vui l�ng th? l?i.');
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
    const message = resolveErrorMessage(error, 'C� l?i x?y ra');
    if (muonJSON(req)) return res.status(500).json({ success: false, message });
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
    req.flash?.('error', 'C� l?i khi x? l� thanh to�n MoMo');
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
    req.flash?.('error', 'C� l?i khi x? l� thanh to�n VNPAY');
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
