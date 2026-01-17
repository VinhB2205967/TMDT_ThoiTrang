const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const { getOrCreateCart, normalizeImage } = require('../../services/cart.service');
const { statusLabels, getAllowedStatuses } = require('../../helpers/orderStatus');

module.exports.index = async (req, res) => {
  const status = String(req.query.status || 'all');
  const allowed = new Set(getAllowedStatuses());
  const currentStatus = allowed.has(status) ? status : 'all';

  const filter = { nguoidung_id: req.user._id, daxoa: { $ne: true } };
  if (currentStatus !== 'all') filter.trangthai = currentStatus;

  const orders = await Donhang.find(filter)
    .sort({ ngaytao: -1 })
    .lean();

  res.render('client/pages/orders/index.pug', {
    titlePage: 'Đơn hàng của tôi',
    orders: orders || [],
    currentStatus,
    statusOptions: getAllowedStatuses(),
    statusLabels
  });
};

module.exports.detail = async (req, res) => {
  const order = await Donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
  if (!order) {
    return res.status(404).render('client/pages/orders/detail.pug', {
      titlePage: 'Không tìm thấy đơn hàng',
      order: null,
      items: []
    });
  }

  const items = await Chitietdonhang.find({ donhang_id: order._id }).lean();

  return res.render('client/pages/orders/detail.pug', {
    titlePage: `Chi tiết ${order.madonhang || 'đơn hàng'}`,
    order,
    items: items || []
  });
};

module.exports.cancel = async (req, res) => {
  const order = await Donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } });
  if (!order) {
    req.flash('success', 'Không tìm thấy đơn hàng.');
    return res.redirect('/orders');
  }

  if (order.trangthai !== 'choxacnhan') {
    req.flash('success', 'Đơn hàng này không thể hủy ở trạng thái hiện tại.');
    return res.redirect(`/orders/${order._id}`);
  }

  order.trangthai = 'dahuy';
  order.lydohuy = String(req.body.reason || '').trim() || 'Khách hàng hủy đơn';
  order.ngaycapnhat = new Date();
  await order.save();

  req.flash('success', 'Đã hủy đơn hàng.');
  return res.redirect('/orders');
};

module.exports.reorder = async (req, res) => {
  const order = await Donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
  if (!order) {
    req.flash('success', 'Không tìm thấy đơn hàng.');
    return res.redirect('/orders');
  }

  const items = await Chitietdonhang.find({ donhang_id: order._id }).lean();
  if (!items || !items.length) {
    req.flash('success', 'Đơn hàng không có sản phẩm để mua lại.');
    return res.redirect('/orders');
  }

  const cart = await getOrCreateCart(req.user._id);

  let addedCount = 0;
  let skippedCount = 0;

  for (const it of items) {
    const product = await Sanpham.findOne({ _id: it.sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' }).lean();
    if (!product) {
      skippedCount += 1;
      continue;
    }

    const bientheId = it.bienthe_id ? String(it.bienthe_id) : '';
    const sizeVal = it.kichco ? String(it.kichco) : '';

    const existing = (cart.sanpham || []).find(ci => String(ci.sanpham_id) === String(it.sanpham_id)
      && String(ci.bienthe_id || '') === bientheId
      && String(ci.kichco || '') === sizeVal);

    const qty = Math.max(1, parseInt(it.soluong, 10) || 1);

    if (existing) {
      existing.soluong = (existing.soluong || 0) + qty;
    } else {
      cart.sanpham.push({
        sanpham_id: it.sanpham_id,
        bienthe_id: it.bienthe_id || null,
        tensanpham: it.tensanpham || product.tensanpham,
        hinhanh: normalizeImage(it.hinhanh) || normalizeImage(product.hinhanh),
        mausac: it.mausac || product.mausac_chinh || 'Mặc định',
        kichco: it.kichco || null,
        gia: it.giagoc || it.giaban || product.gia || 0,
        giagiam: it.giaban || it.giagoc || product.gia || 0,
        soluong: qty
      });
    }

    addedCount += 1;
  }

  await cart.save();
  req.flash('success', `Đã thêm ${addedCount} sản phẩm vào giỏ hàng${skippedCount ? ` (bỏ qua ${skippedCount} sản phẩm đã ngừng bán)` : ''}.`);
  return res.redirect('/cart');
};
