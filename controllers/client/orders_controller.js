const ordersService = require('../../services/order/client-orders.service');

function applyFlash(req, flash) {
  if (!flash || !flash.type || !flash.message) return;
  req.flash?.(flash.type, flash.message);
}

module.exports.danhSach = async (req, res) => {
  const data = await ordersService.getOrdersPageData({
    userId: req.user._id,
    query: req.query || {}
  });

  return res.render('client/pages/orders/index.pug', {
    titlePage: 'Đơn hàng của tôi',
    ...data
  });
};

module.exports.chiTiet = async (req, res) => {
  const data = await ordersService.getOrderDetailPageData({
    userId: req.user._id,
    orderId: req.params.id,
    paidFlag: req.query?.paid
  });

  if (data && data.flash) applyFlash(req, data.flash);
  if (data && data.redirect) return res.redirect(data.redirect);

  if (data && data.notFound) {
    return res.status(404).render('client/pages/orders/detail.pug', data);
  }

  return res.render('client/pages/orders/detail.pug', data);
};

module.exports.yeuCauHoanHang = async (req, res) => {
  try {
    const result = await ordersService.createReturnRequest({
      userId: req.user._id,
      orderId: req.params.id,
      body: req.body || {},
      files: req.files
    });

    applyFlash(req, result.flash);
    return res.redirect(result.redirect || `/orders/${req.params.id}`);
  } catch (err) {
    console.error('client return request error:', err);
    req.flash?.('error', 'Không thể gửi yêu cầu hoàn hàng lúc này.');
    return res.redirect(`/orders/${req.params.id}`);
  }
};

module.exports.huyDon = async (req, res) => {
  const result = await ordersService.cancelOrderByUser({
    userId: req.user._id,
    orderId: req.params.id,
    reason: req.body?.reason
  });

  applyFlash(req, result.flash);
  return res.redirect(result.redirect || '/orders');
};

module.exports.muaLai = async (req, res) => {
  const result = await ordersService.reorderFromOldOrder({
    userId: req.user._id,
    orderId: req.params.id
  });

  applyFlash(req, result.flash);
  return res.redirect(result.redirect || '/orders');
};

module.exports.thanhToanLai = async (req, res) => {
  try {
    const result = await ordersService.repayOrder({
      userId: req.user._id,
      orderId: req.params.id,
      protocol: req.protocol,
      host: req.get('host'),
      headers: req.headers || {},
      socketRemoteAddress: req.socket?.remoteAddress,
      ip: req.ip
    });

    applyFlash(req, result.flash);
    return res.redirect(result.redirect || `/orders/${req.params.id}`);
  } catch (e) {
    req.flash?.('error', 'Có lỗi khi tạo thanh toán lại.');
    return res.redirect(`/orders/${req.params.id}`);
  }
};

module.exports.kiemTraThanhToan = async (req, res) => {
  try {
    const result = await ordersService.checkOrderPaymentStatus({
      userId: req.user._id,
      orderId: req.params.id
    });

    return res.status(result.status || 200).json(result.payload || { success: false, paid: false });
  } catch {
    return res.status(200).json({ success: false, paid: false });
  }
};

module.exports.doiPhuongThucThanhToan = async (req, res) => {
  try {
    const result = await ordersService.changePaymentMethod({
      userId: req.user._id,
      orderId: req.params.id,
      newMethod: req.body?.phuongthucthanhtoan
    });

    applyFlash(req, result.flash);

    const referer = req.get('referer');
    return res.redirect(referer || result.redirect || `/orders/${req.params.id}`);
  } catch (e) {
    req.flash?.('error', 'Không thể đổi phương thức thanh toán.');
    return res.redirect(`/orders/${req.params.id}`);
  }
};
