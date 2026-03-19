const Giohang = require('../../../models/cart_model');
const Sanpham = require('../../../models/product_model');
const { NO_SIZE_TYPES } = require('../../../config/constants');

function isNoSizeProduct(loaisanpham) {
  return NO_SIZE_TYPES.includes(String(loaisanpham || '').toLowerCase());
}

async function getOrCreateCart(userId) {
  let cart = await Giohang.findOne({ nguoidung_id: userId });
  if (!cart) cart = await Giohang.create({ nguoidung_id: userId, sanpham: [] });
  return cart;
}

function pickVariantAndStock(product, variantId, size) {
  const requireSize = !isNoSizeProduct(product.loaisanpham);

  if (variantId && variantId !== 'main') {
    const variant = (Array.isArray(product.bienthe) ? product.bienthe : []).find((v) => String(v._id) === String(variantId));
    if (!variant) return { error: 'Biến thể không tồn tại' };

    if (requireSize) {
      if (!size) return { error: 'Vui long chon size' };
      const sizeRow = (Array.isArray(variant.sizes) ? variant.sizes : []).find((s) => String(s.size) === String(size));
      const stock = Number(sizeRow && sizeRow.soluong ? sizeRow.soluong : 0);
      return {
        stock,
        bientheId: variant._id,
        gia: Number(variant.gia || product.gia || 0),
        giagiam: Number(variant.gia || product.gia || 0) > 0
          ? Math.round(Number(variant.gia || product.gia || 0) * (100 - Number(variant.phantramgiamgia || product.phantramgiamgia || 0)) / 100)
          : 0,
        hinhanh: String(variant.hinhanh || product.hinhanh || '/images/shopping.png'),
        mausac: String(variant.mausac || product.mausac_chinh || '')
      };
    }

    return {
      stock: Number(variant.soluong || 0),
      bientheId: variant._id,
      gia: Number(variant.gia || product.gia || 0),
      giagiam: Number(variant.gia || product.gia || 0) > 0
        ? Math.round(Number(variant.gia || product.gia || 0) * (100 - Number(variant.phantramgiamgia || product.phantramgiamgia || 0)) / 100)
        : 0,
      hinhanh: String(variant.hinhanh || product.hinhanh || '/images/shopping.png'),
      mausac: String(variant.mausac || product.mausac_chinh || '')
    };
  }

  if (requireSize) {
    if (!size) return { error: 'Vui long chon size' };
    const sizeRow = (Array.isArray(product.sizes) ? product.sizes : []).find((s) => String(s.size) === String(size));
    const stock = Number(sizeRow && sizeRow.soluong ? sizeRow.soluong : 0);
    return {
      stock,
      bientheId: null,
      gia: Number(product.gia || 0),
      giagiam: Number(product.gia || 0) > 0
        ? Math.round(Number(product.gia || 0) * (100 - Number(product.phantramgiamgia || 0)) / 100)
        : 0,
      hinhanh: String(product.hinhanh || '/images/shopping.png'),
      mausac: String(product.mausac_chinh || '')
    };
  }

  return {
    stock: Number(product.soluong_chinh || product.soluongton || 0),
    bientheId: null,
    gia: Number(product.gia || 0),
    giagiam: Number(product.gia || 0) > 0
      ? Math.round(Number(product.gia || 0) * (100 - Number(product.phantramgiamgia || 0)) / 100)
      : 0,
    hinhanh: String(product.hinhanh || '/images/shopping.png'),
    mausac: String(product.mausac_chinh || '')
  };
}

function mapCart(cart) {
  return {
    id: String(cart._id),
    userId: String(cart.nguoidung_id),
    tongtien: Number(cart.tongtien || 0),
    items: (Array.isArray(cart.sanpham) ? cart.sanpham : []).map((i) => ({
      itemId: String(i._id),
      sanpham_id: String(i.sanpham_id),
      bienthe_id: i.bienthe_id ? String(i.bienthe_id) : null,
      tensanpham: String(i.tensanpham || ''),
      hinhanh: String(i.hinhanh || '/images/shopping.png'),
      mausac: String(i.mausac || ''),
      kichco: i.kichco ? String(i.kichco) : null,
      gia: Number(i.gia || 0),
      giagiam: Number(i.giagiam || 0),
      thanhtien: Number(i.thanhtien || ((i.giagiam || i.gia || 0) * (i.soluong || 1))),
      soluong: Number(i.soluong || 1)
    }))
  };
}

module.exports.getCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    return res.json({ success: true, data: mapCart(cart) });
  } catch (err) {
    console.error('cartApi.getCart error:', err);
    return res.status(500).json({ success: false, message: 'Không thể tải giỏ hàng' });
  }
};

module.exports.addItem = async (req, res) => {
  try {
    const sanpham_id = String(req.body.sanpham_id || '').trim();
    const bienthe_id = req.body.bienthe_id ? String(req.body.bienthe_id).trim() : '';
    const kichco = req.body.kichco ? String(req.body.kichco).trim() : '';
    const soluong = Math.max(1, Number(req.body.soluong || 1));

    if (!sanpham_id) return res.status(400).json({ success: false, message: 'Thiếu sanpham_id' });

    const product = await Sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: { $in: ['dangban', 'active'] } });
    if (!product) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

    const selected = pickVariantAndStock(product, bienthe_id, kichco);
    if (selected.error) return res.status(400).json({ success: false, message: selected.error });
    if (selected.stock <= 0) return res.status(400).json({ success: false, message: 'Het hang' });

    const cart = await getOrCreateCart(req.user._id);
    const existing = cart.sanpham.find((i) =>
      String(i.sanpham_id) === String(sanpham_id)
      && String(i.bienthe_id || '') === String(selected.bientheId || '')
      && String(i.kichco || '') === String(kichco || '')
    );

    const canAdd = Math.min(soluong, selected.stock);
    if (existing) {
      existing.soluong = Math.min(Number(existing.soluong || 0) + canAdd, selected.stock);
    } else {
      cart.sanpham.push({
        sanpham_id,
        bienthe_id: selected.bientheId,
        tensanpham: product.tensanpham,
        hinhanh: selected.hinhanh,
        mausac: selected.mausac,
        kichco: kichco || null,
        gia: selected.gia,
        giagiam: selected.giagiam,
        soluong: canAdd
      });
    }

    await cart.save();
    return res.json({ success: true, message: 'Da them vao gio hang', data: mapCart(cart) });
  } catch (err) {
    console.error('cartApi.addItem error:', err);
    return res.status(500).json({ success: false, message: 'Không thể thêm vào giỏ hàng' });
  }
};

module.exports.updateItem = async (req, res) => {
  try {
    const itemId = String(req.params.itemId || '').trim();
    const soluong = Math.max(1, Number(req.body.soluong || 1));

    const cart = await getOrCreateCart(req.user._id);
    const item = cart.sanpham.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy item trong giỏ hàng' });

    item.soluong = soluong;
    await cart.save();

    return res.json({ success: true, message: 'Cap nhat thanh cong', data: mapCart(cart) });
  } catch (err) {
    console.error('cartApi.updateItem error:', err);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật gio hang' });
  }
};

module.exports.removeItem = async (req, res) => {
  try {
    const itemId = String(req.params.itemId || '').trim();

    const cart = await getOrCreateCart(req.user._id);
    cart.sanpham = (cart.sanpham || []).filter((i) => String(i._id) !== itemId);
    await cart.save();

    return res.json({ success: true, message: 'Da xoa item', data: mapCart(cart) });
  } catch (err) {
    console.error('cartApi.removeItem error:', err);
    return res.status(500).json({ success: false, message: 'Không thể xóa item' });
  }
};

module.exports.clearCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    cart.sanpham = [];
    await cart.save();
    return res.json({ success: true, message: 'Da xoa toan bo gio hang', data: mapCart(cart) });
  } catch (err) {
    console.error('cartApi.clearCart error:', err);
    return res.status(500).json({ success: false, message: 'Không thể xóa giỏ hàng' });
  }
};


