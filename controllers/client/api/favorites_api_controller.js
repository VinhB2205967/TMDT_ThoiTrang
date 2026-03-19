const Yeuthich = require('../../../models/favorite_model');
const Sanpham = require('../../../models/product_model');

function normalizeImage(path) {
  if (!path) return '/images/shopping.png';
  if (String(path).startsWith('/public')) return String(path).replace('/public', '');
  return String(path);
}

function mapProduct(item) {
  const gia = Number(item.gia || 0);
  const giam = Number(item.phantramgiamgia || 0);
  const giaSauGiam = giam > 0 ? Math.round(gia * (100 - giam) / 100) : gia;
  return {
    id: String(item._id),
    tensanpham: String(item.tensanpham || ''),
    hinhanh: normalizeImage(item.hinhanh),
    gia,
    phantramgiamgia: giam,
    giaSauGiam,
    loaisanpham: String(item.loaisanpham || ''),
    gioitinh: String(item.gioitinh || '')
  };
}

module.exports.list = async (req, res) => {
  try {
    const rows = await Yeuthich.find({ nguoidung_id: req.user._id }).sort({ ngaythem: -1 }).select('sanpham_id').lean();
    const ids = (rows || []).map((r) => String(r.sanpham_id || '')).filter(Boolean);

    if (!ids.length) {
      return res.json({ success: true, data: { ids: [], items: [] } });
    }

    const products = await Sanpham.find({ _id: { $in: ids }, daxoa: { $ne: true }, trangthai: { $in: ['dangban', 'active'] } }).lean();
    const mapById = new Map((products || []).map((p) => [String(p._id), p]));
    const ordered = ids.map((id) => mapById.get(id)).filter(Boolean).map(mapProduct);

    return res.json({ success: true, data: { ids, items: ordered } });
  } catch (err) {
    console.error('favoritesApi.list error:', err);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách yêu thích' });
  }
};

module.exports.ids = async (req, res) => {
  try {
    const rows = await Yeuthich.find({ nguoidung_id: req.user._id }).select('sanpham_id').lean();
    const ids = (rows || []).map((r) => String(r.sanpham_id || '')).filter(Boolean);
    return res.json({ success: true, data: { ids } });
  } catch (err) {
    console.error('favoritesApi.ids error:', err);
    return res.status(500).json({ success: false, message: 'Không thể tải id yêu thích' });
  }
};

module.exports.add = async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!productId) return res.status(400).json({ success: false, message: 'Thiếu productId' });

    const exists = await Sanpham.exists({ _id: productId, daxoa: { $ne: true } });
    if (!exists) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

    await Yeuthich.updateOne(
      { nguoidung_id: req.user._id, sanpham_id: productId },
      { $setOnInsert: { nguoidung_id: req.user._id, sanpham_id: productId, ngaythem: new Date() } },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Da them vao yeu thich', data: { active: true } });
  } catch (err) {
    console.error('favoritesApi.add error:', err);
    return res.status(500).json({ success: false, message: 'Không thể thêm yêu thích' });
  }
};

module.exports.remove = async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!productId) return res.status(400).json({ success: false, message: 'Thiếu productId' });

    await Yeuthich.deleteOne({ nguoidung_id: req.user._id, sanpham_id: productId });
    return res.json({ success: true, message: 'Da xoa khoi yeu thich', data: { active: false } });
  } catch (err) {
    console.error('favoritesApi.remove error:', err);
    return res.status(500).json({ success: false, message: 'Không thể xóa yêu thích' });
  }
};

module.exports.toggle = async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!productId) return res.status(400).json({ success: false, message: 'Thiếu productId' });

    const existed = await Yeuthich.findOne({ nguoidung_id: req.user._id, sanpham_id: productId }).select('_id').lean();
    if (existed) {
      await Yeuthich.deleteOne({ _id: existed._id });
      return res.json({ success: true, data: { active: false } });
    }

    await Yeuthich.create({ nguoidung_id: req.user._id, sanpham_id: productId, ngaythem: new Date() });
    return res.json({ success: true, data: { active: true } });
  } catch (err) {
    console.error('favoritesApi.toggle error:', err);
    return res.status(500).json({ success: false, message: 'Không thể chuyển trạng thái yêu thích' });
  }
};


