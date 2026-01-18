const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const { getOrCreateCart, normalizeImage } = require('../../services/cart.service');
const { statusLabels, getAllowedStatuses } = require('../../helpers/orderStatus');

function noSizeByType(loaisanpham) {
  return ['tui', 'phukien'].includes(String(loaisanpham || '').toLowerCase());
}

function computeTotalStock(productDoc) {
  if (!productDoc) return 0;

  const hasSize = !noSizeByType(productDoc.loaisanpham);
  let total = 0;

  if (hasSize) {
    (productDoc.sizes || []).forEach(s => { total += (s && s.soluong) ? Number(s.soluong) : 0; });
    (productDoc.bienthe || []).forEach(v => {
      (v.sizes || []).forEach(s => { total += (s && s.soluong) ? Number(s.soluong) : 0; });
    });
    return total;
  }

  total += Number(productDoc.soluong_chinh || 0);
  (productDoc.bienthe || []).forEach(v => { total += Number(v.soluong || 0); });
  return total;
}

async function incrementStockForOrderItem(orderItemDoc) {
  const productId = orderItemDoc.sanpham_id;
  const variantId = orderItemDoc.bienthe_id;
  const size = orderItemDoc.kichco;
  const qty = Math.max(1, parseInt(orderItemDoc.soluong, 10) || 1);

  const product = await Sanpham.findById(productId);
  if (!product) throw new Error('Sản phẩm không tồn tại');

  const baseTotal = (typeof product.soluongton === 'number') ? product.soluongton : computeTotalStock(product);
  const hasSize = !noSizeByType(product.loaisanpham);

  if (!variantId) {
    if (hasSize) {
      product.sizes = product.sizes || [];
      let row = (product.sizes || []).find(s => s.size === size);
      if (!row) {
        product.sizes.push({ size, soluong: qty });
      } else {
        row.soluong = Number(row.soluong || 0) + qty;
      }
    } else {
      product.soluong_chinh = Number(product.soluong_chinh || 0) + qty;
    }

    product.soluongton = baseTotal + qty;
    await product.save();
    return;
  }

  const v = (product.bienthe || []).id(variantId);
  if (!v) throw new Error('Biến thể không tồn tại');

  if (hasSize) {
    v.sizes = v.sizes || [];
    let row = (v.sizes || []).find(s => s.size === size);
    if (!row) {
      v.sizes.push({ size, soluong: qty });
    } else {
      row.soluong = Number(row.soluong || 0) + qty;
    }
  } else {
    v.soluong = Number(v.soluong || 0) + qty;
  }

  product.soluongton = baseTotal + qty;
  await product.save();
}

module.exports.index = async (req, res) => {
  const status = String(req.query.status || 'all');
  const allowed = new Set(getAllowedStatuses());
  const currentStatus = allowed.has(status) ? status : 'all';

  const filter = { nguoidung_id: req.user._id, daxoa: { $ne: true } };
  if (currentStatus !== 'all') filter.trangthai = currentStatus;

  const orders = await Donhang.find(filter)
    .sort({ ngaytao: -1 })
    .lean();

  // Attach preview info (first product + count) for nicer orders list UI
  if (orders && orders.length) {
    const orderIds = orders.map(o => o._id);
    const orderItems = await Chitietdonhang.find({ donhang_id: { $in: orderIds } })
      .select('donhang_id tensanpham hinhanh')
      .sort({ ngaytao: 1 })
      .lean();

    const map = new Map();
    for (const it of (orderItems || [])) {
      const key = String(it.donhang_id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { first: it, count: 1 });
      } else {
        existing.count += 1;
      }
    }

    for (const o of orders) {
      const info = map.get(String(o._id));
      if (!info) {
        o.preview = null;
        continue;
      }
      o.preview = {
        name: info.first && info.first.tensanpham ? String(info.first.tensanpham) : 'Sản phẩm',
        image: normalizeImage(info.first && info.first.hinhanh ? String(info.first.hinhanh) : ''),
        count: info.count || 1
      };
    }
  }

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
      items: [],
      statusLabels
    });
  }

  const items = await Chitietdonhang.find({ donhang_id: order._id }).lean();

  return res.render('client/pages/orders/detail.pug', {
    titlePage: `Chi tiết ${order.madonhang || 'đơn hàng'}`,
    order,
    items: items || [],
    statusLabels
  });
};

module.exports.cancel = async (req, res) => {
  const reason = String(req.body.reason || '').trim() || 'Khách hàng hủy đơn';

  // Atomic status update to prevent double-cancel/double-restock
  const order = await Donhang.findOneAndUpdate(
    { _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true }, trangthai: 'choxacnhan' },
    { $set: { trangthai: 'dahuy', lydohuy: reason, ngaycapnhat: new Date() } },
    { new: true }
  );

  if (!order) {
    const existing = await Donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } })
      .select('_id trangthai')
      .lean();

    if (!existing) {
      req.flash?.('error', 'Không tìm thấy đơn hàng.');
      return res.redirect('/orders');
    }

    req.flash?.('error', 'Đơn hàng này không thể hủy ở trạng thái hiện tại.');
    return res.redirect(`/orders/${existing._id}`);
  }

  const items = await Chitietdonhang.find({ donhang_id: order._id });
  const errors = [];

  for (const it of (items || [])) {
    try {
      await incrementStockForOrderItem(it);
    } catch (e) {
      errors.push(e?.message || 'Có lỗi khi hoàn tồn kho');
    }
  }

  if (errors.length) {
    req.flash?.('error', 'Đã hủy đơn, nhưng có lỗi khi hoàn tồn kho cho một số sản phẩm. Vui lòng liên hệ shop.');
    return res.redirect(`/orders/${order._id}`);
  }

  req.flash?.('success', 'Đã hủy đơn hàng và hoàn lại số lượng sản phẩm.');
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
