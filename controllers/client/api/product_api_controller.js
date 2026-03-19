const Sanpham = require('../../../models/product_model');

function normalizeImage(path) {
  if (!path) return '/images/shopping.png';
  if (String(path).startsWith('/public')) return String(path).replace('/public', '');
  return String(path);
}

function finalPrice(item) {
  const gia = Number(item.gia || 0);
  const giam = Number(item.phantramgiamgia || 0);
  return giam > 0 ? Math.round(gia * (100 - giam) / 100) : gia;
}

function mapProduct(item) {
  return {
    id: String(item._id),
    tensanpham: String(item.tensanpham || ''),
    mota: String(item.mota || ''),
    hinhanh: normalizeImage(item.hinhanh),
    loaisanpham: String(item.loaisanpham || ''),
    gioitinh: String(item.gioitinh || ''),
    gia: Number(item.gia || 0),
    phantramgiamgia: Number(item.phantramgiamgia || 0),
    giaSauGiam: finalPrice(item),
    soluongton: Number(item.soluongton || 0),
    trangthai: String(item.trangthai || '')
  };
}

module.exports.list = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 12)));
    const skip = (page - 1) * limit;

    const keyword = String(req.query.keyword || '').trim();
    const loaisanpham = String(req.query.loaisanpham || '').trim();
    const gioitinh = String(req.query.gioitinh || '').trim();
    const priceMin = Number(req.query.priceMin || 0);
    const priceMax = Number(req.query.priceMax || 0);
    const sort = String(req.query.sort || 'newest').trim();

    const filter = {
      daxoa: { $ne: true },
      trangthai: { $in: ['dangban', 'active'] }
    };

    if (keyword) filter.tensanpham = { $regex: keyword, $options: 'i' };
    if (loaisanpham) filter.loaisanpham = loaisanpham;
    if (gioitinh) filter.gioitinh = gioitinh;
    if (priceMin > 0 || priceMax > 0) {
      filter.gia = {};
      if (priceMin > 0) filter.gia.$gte = priceMin;
      if (priceMax > 0) filter.gia.$lte = priceMax;
    }

    let sortDoc = { ngaytao: -1 };
    if (sort === 'price_asc') sortDoc = { gia: 1 };
    if (sort === 'price_desc') sortDoc = { gia: -1 };
    if (sort === 'name_asc') sortDoc = { tensanpham: 1 };
    if (sort === 'name_desc') sortDoc = { tensanpham: -1 };

    const [rows, total] = await Promise.all([
      Sanpham.find(filter).sort(sortDoc).skip(skip).limit(limit).lean(),
      Sanpham.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: {
        items: (rows || []).map(mapProduct),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (err) {
    console.error('productApi.list error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách sản phẩm' });
  }
};

module.exports.detail = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const item = await Sanpham.findOne({ _id: id, daxoa: { $ne: true }, trangthai: { $in: ['dangban', 'active'] } }).lean();
    if (!item) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

    const product = mapProduct(item);
    product.sizes = Array.isArray(item.sizes) ? item.sizes : [];
    product.bienthe = Array.isArray(item.bienthe) ? item.bienthe.map((v) => ({
      id: String(v._id || ''),
      mausac: String(v.mausac || ''),
      hinhanh: normalizeImage(v.hinhanh || item.hinhanh),
      gia: Number(v.gia || item.gia || 0),
      phantramgiamgia: Number(v.phantramgiamgia || item.phantramgiamgia || 0),
      giaSauGiam: Number(v.gia || item.gia || 0) > 0
        ? Math.round(Number(v.gia || item.gia || 0) * (100 - Number(v.phantramgiamgia || item.phantramgiamgia || 0)) / 100)
        : 0,
      soluong: Number(v.soluong || 0),
      sizes: Array.isArray(v.sizes) ? v.sizes : []
    })) : [];

    return res.json({ success: true, data: product });
  } catch (err) {
    console.error('productApi.detail error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy chi tiết sản phẩm' });
  }
};

module.exports.options = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const item = await Sanpham.findOne({ _id: id, daxoa: { $ne: true }, trangthai: { $in: ['dangban', 'active'] } }).lean();
    if (!item) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

    const variants = [];
    variants.push({
      id: 'main',
      mausac: String(item.mausac_chinh || 'Mac dinh'),
      hinhanh: normalizeImage(item.hinhanh),
      gia: Number(item.gia || 0),
      phantramgiamgia: Number(item.phantramgiamgia || 0),
      giaSauGiam: finalPrice(item),
      soluong: Number(item.soluong_chinh || 0),
      sizes: Array.isArray(item.sizes) ? item.sizes : []
    });

    (Array.isArray(item.bienthe) ? item.bienthe : []).forEach((v) => {
      const price = Number(v.gia || item.gia || 0);
      const discount = Number(v.phantramgiamgia || item.phantramgiamgia || 0);
      variants.push({
        id: String(v._id || ''),
        mausac: String(v.mausac || ''),
        hinhanh: normalizeImage(v.hinhanh || item.hinhanh),
        gia: price,
        phantramgiamgia: discount,
        giaSauGiam: discount > 0 ? Math.round(price * (100 - discount) / 100) : price,
        soluong: Number(v.soluong || 0),
        sizes: Array.isArray(v.sizes) ? v.sizes : []
      });
    });

    return res.json({ success: true, data: { productId: String(item._id), variants } });
  } catch (err) {
    console.error('productApi.options error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy tùy chọn sản phẩm' });
  }
};


