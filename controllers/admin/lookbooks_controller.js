const Lookbook = require('../../models/lookbook_model');
const Sanpham = require('../../models/product_model');

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  return text === 'true' || text === '1' || text === 'on';
}

function normalizeIds(values) {
  if (Array.isArray(values)) return values.map(String).map((id) => id.trim()).filter(Boolean);
  if (values === undefined || values === null || values === '') return [];
  return [String(values).trim()].filter(Boolean);
}

function parseDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function ensureDateRange(startDate, endDate) {
  if (startDate && endDate && startDate > endDate) {
    return 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc';
  }
  return null;
}

async function getProductsForPicker() {
  return Sanpham.find({ daxoa: { $ne: true }, trangthai: 'dangban' })
    .select('_id tensanpham hinhanh gia')
    .sort({ ngaytao: -1 })
    .lean();
}

async function validateInput({ title, productIds, currentId }) {
  if (!title || !String(title).trim()) return 'Tên mùa là bắt buộc';
  if (!Array.isArray(productIds) || productIds.length === 0) return 'Phải chọn ít nhất 1 sản phẩm';

  const duplicated = await Lookbook.findOne({
    $or: [{ title: String(title).trim() }, { tenmua: String(title).trim() }],
    deletedAt: null,
    _id: { $ne: currentId || null }
  }).lean();

  if (duplicated) return 'Tên mùa đã tồn tại';
  return null;
}

function buildPayload(req, isCreate = false) {
  const imageFromUpload = req.file?.filename ? `/uploads/lookbooks/${req.file.filename}` : null;
  const productIds = normalizeIds(req.body.products || req.body.sanpham_ids);
  const startDate = parseDate(req.body.startDate);
  const endDate = parseDate(req.body.endDate);

  return {
    title: String(req.body.title || req.body.tenmua || '').trim(),
    image: imageFromUpload || String(req.body.image || req.body.hinhanh || '').trim() || (isCreate ? '' : undefined),
    description: String(req.body.description || req.body.mota || '').trim(),
    products: productIds,
    order: Number(req.body.order ?? req.body.thuTu ?? 0),
    isActive: toBoolean(req.body.isActive ?? req.body.hienthi, true),
    startDate,
    endDate
  };
}

function pickErrors(payload) {
  const errors = [];
  if (!payload.image) errors.push('Ảnh đại diện là bắt buộc');
  const dateErr = ensureDateRange(payload.startDate, payload.endDate);
  if (dateErr) errors.push(dateErr);
  return errors;
}

module.exports.danhSach = async (req, res) => {
  const lookbooks = await Lookbook.find({ deletedAt: null })
    .populate({ path: 'products', select: '_id tensanpham' })
    .sort({ order: 1, thuTu: 1, createdAt: -1 })
    .lean();

  return res.render('admin/pages/lookbooks/index.pug', {
    titlePage: 'Quản lý Lookbook',
    lookbooks: lookbooks.map((item) => ({
      ...item,
      title: item.title || item.tenmua || 'Lookbook chưa đặt tên',
      image: item.image || item.hinhanh || '',
      order: item.order ?? item.thuTu ?? 0,
      isActive: item.isActive ?? item.hienthi ?? true,
      productCount: Array.isArray(item.products)
        ? item.products.length
        : (Array.isArray(item.sanpham_ids) ? item.sanpham_ids.length : 0)
    }))
  });
};

module.exports.trangTaoMoi = async (req, res) => {
  const products = await getProductsForPicker();
  return res.render('admin/pages/lookbooks/form.pug', {
    titlePage: 'Thêm Lookbook',
    mode: 'create',
    lookbook: {
      title: '',
      image: '',
      description: '',
      products: [],
      order: 0,
      isActive: true,
      startDate: '',
      endDate: ''
    },
    products,
    errors: []
  });
};

module.exports.taoMoi = async (req, res) => {
  const payload = buildPayload(req, true);
  const products = await getProductsForPicker();

  const errors = pickErrors(payload);
  const businessError = await validateInput({ title: payload.title, productIds: payload.products });
  if (businessError) errors.push(businessError);

  if (errors.length) {
    return res.status(400).render('admin/pages/lookbooks/form.pug', {
      titlePage: 'Thêm Lookbook',
      mode: 'create',
      lookbook: payload,
      products,
      errors
    });
  }

  await Lookbook.create(payload);
  req.flash('success', 'Tạo lookbook thành công');
  return res.redirect('/admin/lookbook');
};

module.exports.trangChinhSua = async (req, res) => {
  const [lookbook, products] = await Promise.all([
    Lookbook.findOne({ _id: req.params.id, deletedAt: null })
      .populate({ path: 'products', select: '_id tensanpham hinhanh gia' })
      .lean(),
    getProductsForPicker()
  ]);

  if (!lookbook) {
    return res.status(404).render('admin/pages/errors/404.pug', { titlePage: 'Không tìm thấy Lookbook' });
  }

  return res.render('admin/pages/lookbooks/form.pug', {
    titlePage: 'Chỉnh sửa Lookbook',
    mode: 'edit',
    lookbook: {
      ...lookbook,
      title: lookbook.title || lookbook.tenmua || '',
      image: lookbook.image || lookbook.hinhanh || '',
      description: lookbook.description || lookbook.mota || '',
      order: lookbook.order ?? lookbook.thuTu ?? 0,
      isActive: lookbook.isActive ?? lookbook.hienthi ?? true,
      products: Array.isArray(lookbook.products)
        ? lookbook.products.map((item) => String(item._id || item))
        : (Array.isArray(lookbook.sanpham_ids) ? lookbook.sanpham_ids.map((item) => String(item)) : [])
    },
    products,
    errors: []
  });
};

module.exports.capNhat = async (req, res) => {
  const current = await Lookbook.findOne({ _id: req.params.id, deletedAt: null });
  if (!current) {
    return res.status(404).render('admin/pages/errors/404.pug', { titlePage: 'Không tìm thấy Lookbook' });
  }

  const rawPayload = buildPayload(req, false);
  const payload = {
    ...rawPayload,
    image: rawPayload.image || current.image
  };

  const products = await getProductsForPicker();
  const errors = pickErrors(payload);
  const businessError = await validateInput({ title: payload.title, productIds: payload.products, currentId: current._id });
  if (businessError) errors.push(businessError);

  if (errors.length) {
    return res.status(400).render('admin/pages/lookbooks/form.pug', {
      titlePage: 'Chỉnh sửa Lookbook',
      mode: 'edit',
      lookbook: { ...payload, _id: current._id },
      products,
      errors
    });
  }

  current.title = payload.title;
  current.image = payload.image;
  current.description = payload.description;
  current.products = payload.products;
  current.order = payload.order;
  current.isActive = payload.isActive;
  current.startDate = payload.startDate;
  current.endDate = payload.endDate;
  await current.save();

  req.flash('success', 'Cập nhật lookbook thành công');
  return res.redirect('/admin/lookbook');
};

module.exports.xoa = async (req, res) => {
  const lookbook = await Lookbook.findOneAndUpdate(
    { _id: req.params.id, deletedAt: null },
    {
      $set: {
        deletedAt: new Date(),
        isActive: false,
        hienthi: false
      }
    },
    { new: true }
  );

  if (!lookbook) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy lookbook' });
  }

  return res.json({ success: true, message: 'Đã xóa lookbook' });
};

module.exports.batTat = async (req, res) => {
  const lookbook = await Lookbook.findOne({ _id: req.params.id, deletedAt: null })
    .select('_id isActive hienthi')
    .lean();

  if (!lookbook) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy lookbook' });
  }

  const current = lookbook.isActive !== undefined ? Boolean(lookbook.isActive) : Boolean(lookbook.hienthi);
  const nextState = !current;

  await Lookbook.updateOne(
    { _id: req.params.id, deletedAt: null },
    { $set: { isActive: nextState, hienthi: nextState } }
  );

  return res.json({ success: true, isActive: nextState });
};
