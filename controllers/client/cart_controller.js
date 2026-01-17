const Sanpham = require('../../models/product_model');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Nguoidung = require('../../models/user_model');
const { getOrCreateCart, normalizeImage } = require('../../services/cart.service');

function wantsJSON(req) {
  const accept = String(req.headers.accept || '');
  return req.xhr || accept.includes('application/json') || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
}

function noSizeByType(loaisanpham) {
  return ['tui', 'phukien'].includes(String(loaisanpham || '').toLowerCase());
}

// normalizeImage + getOrCreateCart are shared in services/cart.service.js

function resolveVariantAndStock(productDoc, bientheId, kichco) {
  const hasSize = !noSizeByType(productDoc.loaisanpham);
  const isMain = !bientheId || bientheId === 'main';

  if (isMain) {
    const mausac = productDoc.mausac_chinh || 'Mặc định';
    const hinhanh = normalizeImage(productDoc.hinhanh);
    const gia = productDoc.gia || 0;
    const giam = productDoc.phantramgiamgia || 0;
    const giagiam = giam > 0 ? Math.round(gia * (100 - giam) / 100) : gia;

    if (hasSize) {
      const sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const sizeRow = sizes.find(s => s.size === kichco);
      const stock = sizeRow ? (sizeRow.soluong || 0) : 0;
      return { hasSize, stock, bienTheObjId: null, mausac, hinhanh, gia, giagiam };
    }

    const stock = productDoc.soluong_chinh || 0;
    return { hasSize, stock, bienTheObjId: null, mausac, hinhanh, gia, giagiam };
  }

  const variant = (productDoc.bienthe || []).find(v => String(v._id) === String(bientheId));
  if (!variant) return { error: 'Biến thể không tồn tại' };

  const mausac = variant.mausac || 'Màu';
  const hinhanh = normalizeImage(variant.hinhanh) || normalizeImage(productDoc.hinhanh);
  const gia = variant.gia || productDoc.gia || 0;
  const giam = variant.phantramgiamgia != null ? variant.phantramgiamgia : (productDoc.phantramgiamgia || 0);
  const giagiam = giam > 0 ? Math.round(gia * (100 - giam) / 100) : gia;

  if (hasSize) {
    const sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
    const sizeRow = sizes.find(s => s.size === kichco);
    const stock = sizeRow ? (sizeRow.soluong || 0) : 0;
    return { hasSize, stock, bienTheObjId: variant._id, mausac, hinhanh, gia, giagiam };
  }

  const stock = variant.soluong || 0;
  return { hasSize, stock, bienTheObjId: variant._id, mausac, hinhanh, gia, giagiam };
}

module.exports.index = async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  res.render('client/pages/cart/index.pug', {
    titlePage: 'Giỏ hàng',
    cart
  });
};

module.exports.add = async (req, res) => {
  try {
    const { sanpham_id, bienthe_id, kichco } = req.body;
    const soluong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const product = await Sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!product) {
      return wantsJSON(req) ? res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' }) : res.redirect('/products');
    }

    const hasSize = !noSizeByType(product.loaisanpham);
    if (hasSize && !kichco) {
      return wantsJSON(req) ? res.status(400).json({ success: false, message: 'Vui lòng chọn size' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const resolved = resolveVariantAndStock(product, bienthe_id, kichco);
    if (resolved.error) {
      return wantsJSON(req) ? res.status(400).json({ success: false, message: resolved.error }) : res.redirect(`/products/${sanpham_id}`);
    }

    if (resolved.stock <= 0) {
      return wantsJSON(req) ? res.status(400).json({ success: false, message: 'Hết hàng' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const qtyToAdd = Math.min(soluong, resolved.stock);

    const cart = await getOrCreateCart(req.user._id);
    const existing = cart.sanpham.find(i => String(i.sanpham_id) === String(sanpham_id)
      && String(i.bienthe_id || '') === String(resolved.bienTheObjId || '')
      && String(i.kichco || '') === String(kichco || ''));

    if (existing) {
      existing.soluong = Math.min(resolved.stock, (existing.soluong || 0) + qtyToAdd);
    } else {
      cart.sanpham.push({
        sanpham_id,
        bienthe_id: resolved.bienTheObjId,
        tensanpham: product.tensanpham,
        hinhanh: resolved.hinhanh,
        mausac: resolved.mausac,
        kichco: kichco || null,
        gia: resolved.gia,
        giagiam: resolved.giagiam,
        soluong: qtyToAdd
      });
    }

    await cart.save();

    if (wantsJSON(req)) {
      return res.json({ success: true, cartCount: cart.sanpham.length });
    }

    return res.redirect('/cart');
  } catch (e) {
    if (wantsJSON(req)) return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
    return res.redirect('/cart');
  }
};

module.exports.buyNow = async (req, res) => {
  try {
    const { sanpham_id, bienthe_id, kichco } = req.body;
    const soluong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const product = await Sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!product) {
      return wantsJSON(req) ? res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' }) : res.redirect('/products');
    }

    const hasSize = !noSizeByType(product.loaisanpham);
    if (hasSize && !kichco) {
      return wantsJSON(req) ? res.status(400).json({ success: false, message: 'Vui lòng chọn size' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const resolved = resolveVariantAndStock(product, bienthe_id, kichco);
    if (resolved.error) {
      return wantsJSON(req) ? res.status(400).json({ success: false, message: resolved.error }) : res.redirect(`/products/${sanpham_id}`);
    }

    if (resolved.stock <= 0) {
      return wantsJSON(req) ? res.status(400).json({ success: false, message: 'Hết hàng' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const qtyToAdd = Math.min(soluong, resolved.stock);
    const cart = await getOrCreateCart(req.user._id);

    const existing = cart.sanpham.find(i => String(i.sanpham_id) === String(sanpham_id)
      && String(i.bienthe_id || '') === String(resolved.bienTheObjId || '')
      && String(i.kichco || '') === String(kichco || ''));

    let targetItemId;
    if (existing) {
      existing.soluong = qtyToAdd;
      targetItemId = existing._id;
    } else {
      cart.sanpham.push({
        sanpham_id,
        bienthe_id: resolved.bienTheObjId,
        tensanpham: product.tensanpham,
        hinhanh: resolved.hinhanh,
        mausac: resolved.mausac,
        kichco: kichco || null,
        gia: resolved.gia,
        giagiam: resolved.giagiam,
        soluong: qtyToAdd
      });
      targetItemId = cart.sanpham[cart.sanpham.length - 1]._id;
    }

    await cart.save();

    const redirectUrl = targetItemId ? `/cart/checkout?itemIds=${targetItemId}` : '/cart/checkout';

    if (wantsJSON(req)) {
      return res.json({ success: true, cartCount: cart.sanpham.length, redirect: redirectUrl });
    }

    return res.redirect(redirectUrl);
  } catch (e) {
    if (wantsJSON(req)) return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
    return res.redirect('/cart');
  }
};

module.exports.updateQty = async (req, res) => {
  const itemId = req.body.itemId;
  const qty = Math.max(1, parseInt(req.body.soluong, 10) || 1);

  const cart = await getOrCreateCart(req.user._id);
  const item = cart.sanpham.id(itemId);
  if (item) item.soluong = qty;
  await cart.save();

  return wantsJSON(req) ? res.json({ success: true, cartCount: cart.sanpham.length }) : res.redirect('/cart');
};

module.exports.updateOptions = async (req, res) => {
  try {
    const itemId = String(req.body.itemId || '').trim();
    const sanpham_id = String(req.body.sanpham_id || '').trim();
    const bienthe_id = req.body.bienthe_id ? String(req.body.bienthe_id).trim() : null;
    const kichco = req.body.kichco ? String(req.body.kichco).trim() : null;
    const soluong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const cart = await getOrCreateCart(req.user._id);
    const item = cart.sanpham.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm trong giỏ' });

    const productId = sanpham_id || String(item.sanpham_id);
    const product = await Sanpham.findOne({ _id: productId, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!product) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

    const hasSize = !noSizeByType(product.loaisanpham);
    if (hasSize && !kichco) return res.status(400).json({ success: false, message: 'Vui lòng chọn size' });

    const resolved = resolveVariantAndStock(product, bienthe_id, kichco);
    if (resolved.error) return res.status(400).json({ success: false, message: resolved.error });
    if (resolved.stock <= 0) return res.status(400).json({ success: false, message: 'Hết hàng' });

    const qty = Math.min(soluong, resolved.stock);

    // Merge if another line already has same selection
    const dup = cart.sanpham.find(i => String(i._id) !== String(itemId)
      && String(i.sanpham_id) === String(productId)
      && String(i.bienthe_id || '') === String(resolved.bienTheObjId || '')
      && String(i.kichco || '') === String(kichco || ''));

    if (dup) {
      dup.soluong = Math.min(resolved.stock, (dup.soluong || 0) + qty);
      item.remove();
    } else {
      item.sanpham_id = productId;
      item.bienthe_id = resolved.bienTheObjId;
      item.tensanpham = product.tensanpham;
      item.hinhanh = resolved.hinhanh;
      item.mausac = resolved.mausac;
      item.kichco = kichco || null;
      item.gia = resolved.gia;
      item.giagiam = resolved.giagiam;
      item.soluong = qty;
    }

    await cart.save();
    return res.json({ success: true, cartCount: cart.sanpham.length });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.remove = async (req, res) => {
  const itemId = req.body.itemId;

  const cart = await getOrCreateCart(req.user._id);
  cart.sanpham = cart.sanpham.filter(i => String(i._id) !== String(itemId));
  await cart.save();

  return wantsJSON(req) ? res.json({ success: true, cartCount: cart.sanpham.length }) : res.redirect('/cart');
};

module.exports.clear = async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.sanpham = [];
  await cart.save();
  return wantsJSON(req) ? res.json({ success: true, cartCount: 0 }) : res.redirect('/cart');
};

module.exports.checkoutPage = async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);

  const q = req.query.itemIds;
  const selectedIds = Array.isArray(q) ? q.map(String) : (q ? [String(q)] : []);
  const selectedSet = new Set(selectedIds);
  const items = selectedIds.length
    ? (cart.sanpham || []).filter(it => selectedSet.has(String(it._id)))
    : (cart.sanpham || []);

  const subtotal = items.reduce((sum, it) => {
    const price = it.giagiam || it.gia || 0;
    return sum + (price * (it.soluong || 1));
  }, 0);

  const user = await Nguoidung.findOne({ _id: req.user._id, daxoa: { $ne: true } }).lean();
  const diachiList = Array.isArray(user?.diachiList) ? user.diachiList : [];
  const addresses = [];
  if (user?.diachi) {
    addresses.push({
      _id: 'profile',
      label: 'Địa chỉ mặc định',
      tennguoinhan: user?.hoten || '',
      sodienthoai: user?.sodienthoai || '',
      diachi: user?.diachi || ''
    });
  }
  diachiList.forEach((a) => {
    addresses.push({
      _id: String(a._id),
      label: a.label || 'Địa chỉ',
      tennguoinhan: a.tennguoinhan || user?.hoten || '',
      sodienthoai: a.sodienthoai || user?.sodienthoai || '',
      diachi: a.diachi || ''
    });
  });

  res.render('client/pages/cart/checkout.pug', {
    titlePage: 'Thanh toán',
    cart,
    items,
    subtotal,
    selectedIds: items.map(it => String(it._id)),
    userProfile: {
      hoten: user?.hoten || '',
      sodienthoai: user?.sodienthoai || '',
      email: user?.email || '',
      diachi: user?.diachi || ''
    },
    addresses
  });
};

async function decrementStockForItem(item) {
  const productId = item.sanpham_id;
  const variantId = item.bienthe_id;
  const size = item.kichco;
  const qty = item.soluong || 1;

  const product = await Sanpham.findById(productId);
  if (!product) throw new Error('Sản phẩm không tồn tại');

  const hasSize = !noSizeByType(product.loaisanpham);

  if (!variantId) {
    if (hasSize) {
      const row = (product.sizes || []).find(s => s.size === size);
      if (!row || row.soluong < qty) throw new Error('Không đủ hàng');
      row.soluong -= qty;
    } else {
      if ((product.soluong_chinh || 0) < qty) throw new Error('Không đủ hàng');
      product.soluong_chinh = (product.soluong_chinh || 0) - qty;
    }
    await product.save();
    return;
  }

  const v = (product.bienthe || []).id(variantId);
  if (!v) throw new Error('Biến thể không tồn tại');

  if (hasSize) {
    const row = (v.sizes || []).find(s => s.size === size);
    if (!row || row.soluong < qty) throw new Error('Không đủ hàng');
    row.soluong -= qty;
  } else {
    if ((v.soluong || 0) < qty) throw new Error('Không đủ hàng');
    v.soluong = (v.soluong || 0) - qty;
  }

  await product.save();
}

module.exports.checkoutSubmit = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    if (!cart.sanpham || cart.sanpham.length === 0) {
      return res.redirect('/cart');
    }

    const rawIds = req.body.itemIds;
    const selectedIds = Array.isArray(rawIds) ? rawIds.map(String) : (rawIds ? [String(rawIds)] : []);
    const selectedSet = new Set(selectedIds);
    const items = selectedIds.length
      ? cart.sanpham.filter(it => selectedSet.has(String(it._id)))
      : cart.sanpham;

    if (!items.length) {
      req.flash?.('error', 'Vui lòng chọn sản phẩm để thanh toán');
      return res.redirect('/cart');
    }

    const user = await Nguoidung.findOne({ _id: req.user._id, daxoa: { $ne: true } });

    const addressId = String(req.body.addressId || '');
    let tennguoinhan = '';
    let sodienthoai = '';
    let diachigiao = '';

    if (addressId && addressId !== 'new') {
      if (addressId === 'profile') {
        tennguoinhan = String(user?.hoten || '').trim();
        sodienthoai = String(user?.sodienthoai || '').trim();
        diachigiao = String(user?.diachi || '').trim();
      } else {
        const found = (user?.diachiList || []).find(a => String(a._id) === addressId);
        if (found) {
          tennguoinhan = String(found.tennguoinhan || user?.hoten || '').trim();
          sodienthoai = String(found.sodienthoai || user?.sodienthoai || '').trim();
          diachigiao = String(found.diachi || '').trim();
        }
      }
    }

    // fallback/new
    if (!tennguoinhan || !sodienthoai || !diachigiao) {
      tennguoinhan = String(req.body.tennguoinhan || '').trim();
      sodienthoai = String(req.body.sodienthoai || '').trim();
      diachigiao = String(req.body.diachigiao || '').trim();
    }

    if (!tennguoinhan || !sodienthoai || !diachigiao) {
      req.flash?.('error', 'Vui lòng nhập đầy đủ họ tên, số điện thoại, địa chỉ');
      return res.redirect('/cart/checkout');
    }

    const email = String(req.body.email || user?.email || '').trim();
    const ghichu = String(req.body.ghichu || '').trim();
    const phuongthucthanhtoan = String(req.body.phuongthucthanhtoan || 'cod');

    // Save new address if requested
    if (String(req.body.saveAddress || '') && user && (addressId === 'new' || !addressId)) {
      user.diachiList = user.diachiList || [];
      user.diachiList.push({
        label: String(req.body.addressLabel || '').trim() || 'Địa chỉ',
        tennguoinhan,
        sodienthoai,
        diachi: diachigiao
      });
      await user.save();
    }

    const subtotal = items.reduce((sum, it) => {
      const price = it.giagiam || it.gia || 0;
      return sum + (price * (it.soluong || 1));
    }, 0);

    const order = await Donhang.create({
      nguoidung_id: req.user._id,
      tennguoinhan,
      sodienthoai,
      email,
      diachigiao,
      ghichu,
      phuongthucthanhtoan,
      tamtinh: subtotal,
      tongtien: subtotal,
      trangthai: 'choxacnhan'
    });

    for (const it of items) {
      await decrementStockForItem(it);
      await Chitietdonhang.create({
        donhang_id: order._id,
        sanpham_id: it.sanpham_id,
        bienthe_id: it.bienthe_id,
        tensanpham: it.tensanpham,
        hinhanh: it.hinhanh,
        mausac: it.mausac,
        kichco: it.kichco,
        giagoc: it.gia,
        giaban: it.giagiam || it.gia,
        soluong: it.soluong,
        thanhtien: (it.giagiam || it.gia || 0) * (it.soluong || 1)
      });
    }

    const paidSet = new Set(items.map(it => String(it._id)));
    cart.sanpham = cart.sanpham.filter(it => !paidSet.has(String(it._id)));
    await cart.save();

    if (phuongthucthanhtoan === 'cod') {
      req.flash?.('success', 'Đặt hàng thành công!');
    }

    return res.redirect(`/orders/${order._id}`);
  } catch (e) {
    if (wantsJSON(req)) return res.status(500).json({ success: false, message: e.message || 'Có lỗi xảy ra' });
    req.flash?.('error', e.message || 'Có lỗi xảy ra');
    return res.redirect('/cart/checkout');
  }
};
