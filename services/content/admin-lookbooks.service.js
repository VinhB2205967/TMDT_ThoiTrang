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

function buildPayload({ body = {}, file = null, isCreate = false }) {
  const imageFromUpload = file && file.filename ? `/uploads/lookbooks/${file.filename}` : null;
  const productIds = normalizeIds(body.products || body.sanpham_ids);
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);

  return {
    title: String(body.title || body.tenmua || '').trim(),
    image: imageFromUpload || String(body.image || body.hinhanh || '').trim() || (isCreate ? '' : undefined),
    description: String(body.description || body.mota || '').trim(),
    products: productIds,
    order: Number(body.order ?? body.thuTu ?? 0),
    isActive: toBoolean(body.isActive ?? body.hienthi, true),
    noiBat: toBoolean(body.noiBat ?? body.isFeatured, false),
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

async function layDanhSachLookbookData() {
  const lookbooks = await Lookbook.find({ deletedAt: null })
    .populate({ path: 'products', select: '_id tensanpham' })
    .sort({ order: 1, thuTu: 1, createdAt: -1 })
    .lean();

  const mapped = lookbooks.map((item) => ({
    ...item,
    title: item.title || item.tenmua || 'Lookbook chưa đặt tên',
    image: item.image || item.hinhanh || '',
    order: item.order ?? item.thuTu ?? 0,
    isActive: item.isActive ?? item.hienthi ?? true,
    noiBat: item.noiBat ?? item.isFeatured ?? false,
    productCount: Array.isArray(item.products)
      ? item.products.length
      : (Array.isArray(item.sanpham_ids) ? item.sanpham_ids.length : 0)
  }));

  return { ok: true, status: 200, data: mapped };
}

async function getTrangTaoData() {
  const products = await getProductsForPicker();
  return {
    ok: true,
    status: 200,
    data: {
      lookbook: {
        title: '',
        image: '',
        description: '',
        products: [],
        order: 0,
        isActive: true,
        noiBat: false,
        startDate: '',
        endDate: ''
      },
      products,
      errors: []
    }
  };
}

async function taoLookbook({ body = {}, file = null }) {
  const payload = buildPayload({ body, file, isCreate: true });
  const errors = pickErrors(payload);
  const businessError = await validateInput({ title: payload.title, productIds: payload.products });
  if (businessError) errors.push(businessError);

  if (errors.length) return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: errors[0], errors, data: payload };

  const created = await Lookbook.create(payload);
  return { ok: true, status: 201, message: 'Tạo lookbook thành công', data: created };
}

async function getTrangChinhSuaData(id) {
  const [lookbook, products] = await Promise.all([
    Lookbook.findOne({ _id: id, deletedAt: null })
      .populate({ path: 'products', select: '_id tensanpham hinhanh gia' })
      .lean(),
    getProductsForPicker()
  ]);

  if (!lookbook) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy lookbook' };

  return {
    ok: true,
    status: 200,
    data: {
      lookbook: {
        ...lookbook,
        title: lookbook.title || lookbook.tenmua || '',
        image: lookbook.image || lookbook.hinhanh || '',
        description: lookbook.description || lookbook.mota || '',
        order: lookbook.order ?? lookbook.thuTu ?? 0,
        isActive: lookbook.isActive ?? lookbook.hienthi ?? true,
        noiBat: lookbook.noiBat ?? lookbook.isFeatured ?? false,
        products: Array.isArray(lookbook.products)
          ? lookbook.products.map((item) => String(item._id || item))
          : (Array.isArray(lookbook.sanpham_ids) ? lookbook.sanpham_ids.map((item) => String(item)) : [])
      },
      products,
      errors: []
    }
  };
}

async function capNhatLookbook({ id, body = {}, file = null }) {
  const current = await Lookbook.findOne({ _id: id, deletedAt: null });
  if (!current) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy lookbook' };

  const rawPayload = buildPayload({ body, file, isCreate: false });
  const payload = { ...rawPayload, image: rawPayload.image || current.image };

  const errors = pickErrors(payload);
  const businessError = await validateInput({ title: payload.title, productIds: payload.products, currentId: current._id });
  if (businessError) errors.push(businessError);

  if (errors.length) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: errors[0], errors, data: { ...payload, _id: current._id } };
  }

  current.title = payload.title;
  current.image = payload.image;
  current.description = payload.description;
  current.products = payload.products;
  current.order = payload.order;
  current.isActive = payload.isActive;
  current.noiBat = payload.noiBat;
  current.isFeatured = payload.noiBat;
  current.startDate = payload.startDate;
  current.endDate = payload.endDate;
  await current.save();

  return { ok: true, status: 200, message: 'Cập nhật lookbook thành công', data: current };
}

async function xoaLookbook(id) {
  const lookbook = await Lookbook.findOneAndUpdate(
    { _id: id, deletedAt: null },
    {
      $set: {
        deletedAt: new Date(),
        isActive: false,
        hienthi: false
      }
    },
    { new: true }
  );

  if (!lookbook) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy lookbook' };
  return { ok: true, status: 200, message: 'Đã xóa lookbook' };
}

async function batTatLookbook(id) {
  const lookbook = await Lookbook.findOne({ _id: id, deletedAt: null })
    .select('_id isActive hienthi')
    .lean();

  if (!lookbook) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy lookbook' };

  const current = lookbook.isActive !== undefined ? Boolean(lookbook.isActive) : Boolean(lookbook.hienthi);
  const nextState = !current;

  await Lookbook.updateOne(
    { _id: id, deletedAt: null },
    { $set: { isActive: nextState, hienthi: nextState } }
  );

  return { ok: true, status: 200, message: 'Cập nhật trạng thái lookbook thành công', data: { isActive: nextState } };
}

async function capNhatNoiBatLookbook(id, body = {}) {
  const lookbook = await Lookbook.findOne({ _id: id, deletedAt: null })
    .select('_id noiBat isFeatured')
    .lean();

  if (!lookbook) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy lookbook' };

  const current = lookbook.noiBat !== undefined ? Boolean(lookbook.noiBat) : Boolean(lookbook.isFeatured);
  const nextState = body.noiBat !== undefined
    ? toBoolean(body.noiBat, current)
    : !current;

  await Lookbook.updateOne(
    { _id: id, deletedAt: null },
    { $set: { noiBat: nextState, isFeatured: nextState } }
  );

  return { ok: true, status: 200, message: 'Cập nhật nổi bật lookbook thành công', data: { noiBat: nextState } };
}

module.exports = {
  getProductsForPicker,
  layDanhSachLookbookData,
  getTrangTaoData,
  taoLookbook,
  getTrangChinhSuaData,
  capNhatLookbook,
  xoaLookbook,
  batTatLookbook,
  capNhatNoiBatLookbook
};
