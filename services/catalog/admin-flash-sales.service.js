const mongoose = require('mongoose');
const FlashSale = require('../../models/flash_sale_model');
const Sanpham = require('../../models/product_model');

function parseBoolean(input, fallback = false) {
  if (input === undefined || input === null || input === '') return fallback;
  if (typeof input === 'boolean') return input;
  const raw = String(input).trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
}

function parseDanhSachSanPham(raw) {
  if (!raw) return [];

  const source = Array.isArray(raw) ? raw : [raw];
  const ids = [];
  for (const item of source) {
    if (!item) continue;
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (mongoose.Types.ObjectId.isValid(trimmed)) ids.push(trimmed);
      continue;
    }

    if (typeof item === 'object' && item.sanpham_id && mongoose.Types.ObjectId.isValid(String(item.sanpham_id))) {
      ids.push(String(item.sanpham_id));
    }
  }

  const uniq = [...new Set(ids)];
  return uniq.map((id) => ({ sanpham_id: id }));
}

function normalizePayload(body = {}) {
  return {
    ten: String(body.ten || '').trim(),
    batdau: body.batdau ? new Date(body.batdau) : null,
    ketthuc: body.ketthuc ? new Date(body.ketthuc) : null,
    hienthi: parseBoolean(body.hienthi, true),
    phantramgiamgia: Number(body.phantramgiamgia || 0),
    sanpham: parseDanhSachSanPham(body.sanpham)
  };
}

function validatePayload(payload) {
  if (!payload.ten) return 'Tên chương trình là bắt buộc';
  if (!(payload.batdau instanceof Date) || Number.isNaN(payload.batdau.getTime())) return 'Thời gian bắt đầu không hợp lệ';
  if (!(payload.ketthuc instanceof Date) || Number.isNaN(payload.ketthuc.getTime())) return 'Thời gian kết thúc không hợp lệ';
  if (payload.ketthuc.getTime() <= payload.batdau.getTime()) return 'Thời gian kết thúc phải lớn hơn bắt đầu';
  if (!Number.isFinite(payload.phantramgiamgia) || payload.phantramgiamgia <= 0 || payload.phantramgiamgia > 90) {
    return '% giảm giá phải lớn hơn 0 và nhỏ hơn hoặc bằng 90';
  }
  if (!Array.isArray(payload.sanpham) || !payload.sanpham.length) return 'Vui lòng chọn ít nhất 1 sản phẩm';
  return null;
}

async function kiemTraTrungSanPhamHoatDong(payload, excludeId = null) {
  const productIds = payload.sanpham.map((item) => new mongoose.Types.ObjectId(String(item.sanpham_id)));
  const overlap = await FlashSale.findOne({
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    hienthi: true,
    batdau: { $lt: payload.ketthuc },
    ketthuc: { $gt: payload.batdau },
    'sanpham.sanpham_id': { $in: productIds }
  }).select('_id ten').lean();

  if (!overlap) return null;
  return `Sản phẩm đã thuộc Flash Sale đang hoạt động: ${overlap.ten}`;
}

async function kiemTraSanPhamHopLe(payload) {
  const ids = payload.sanpham.map((item) => String(item.sanpham_id));
  const products = await Sanpham.find({
    _id: { $in: ids },
    daxoa: { $ne: true },
    trangthai: 'dangban'
  }).select('_id').lean();

  if (products.length !== ids.length) {
    return 'Có sản phẩm không hợp lệ hoặc đã ngừng bán trong danh sách Flash Sale';
  }
  return null;
}

async function withProductNames(data) {
  const rows = Array.isArray(data) ? data : [data];
  const ids = [];
  rows.forEach((sale) => {
    (sale.sanpham || []).forEach((item) => {
      if (item && item.sanpham_id) ids.push(String(item.sanpham_id));
    });
  });

  const uniqIds = [...new Set(ids)].filter((id) => mongoose.Types.ObjectId.isValid(id));
  const products = uniqIds.length
    ? await Sanpham.find({ _id: { $in: uniqIds } }).select('_id tensanpham').lean()
    : [];
  const nameMap = new Map(products.map((p) => [String(p._id), p.tensanpham]));

  const result = rows.map((sale) => ({
    ...sale,
    sanpham: (sale.sanpham || []).map((item) => ({
      ...item,
      tenSanPham: nameMap.get(String(item.sanpham_id)) || String(item.sanpham_id)
    }))
  }));

  return Array.isArray(data) ? result : result[0];
}

async function getDanhSachData() {
  const raw = await FlashSale.find({}).sort({ batdau: -1 }).lean();
  return withProductNames(raw);
}

async function getProductsForAdminForm() {
  return Sanpham.find({ daxoa: { $ne: true }, trangthai: 'dangban' })
    .sort({ tensanpham: 1, ngaytao: -1 })
    .lean();
}

async function taoMoiFlashSale(body = {}) {
  const payload = normalizePayload(body);
  const message = validatePayload(payload);
  if (message) return { ok: false, status: 400, message };

  const sanphamKhongHopLe = await kiemTraSanPhamHopLe(payload);
  if (sanphamKhongHopLe) return { ok: false, status: 400, message: sanphamKhongHopLe };

  if (payload.hienthi) {
    const trung = await kiemTraTrungSanPhamHoatDong(payload);
    if (trung) return { ok: false, status: 409, message: trung };
  }

  const data = await FlashSale.create(payload);
  const enriched = await withProductNames(data.toObject());
  return { ok: true, status: 200, data: enriched };
}

async function capNhatFlashSale(id, body = {}) {
  const flashSaleId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(flashSaleId)) {
    return { ok: false, status: 400, message: 'ID không hợp lệ' };
  }

  const payload = normalizePayload(body);
  const message = validatePayload(payload);
  if (message) return { ok: false, status: 400, message };

  const sanphamKhongHopLe = await kiemTraSanPhamHopLe(payload);
  if (sanphamKhongHopLe) return { ok: false, status: 400, message: sanphamKhongHopLe };

  if (payload.hienthi) {
    const trung = await kiemTraTrungSanPhamHoatDong(payload, flashSaleId);
    if (trung) return { ok: false, status: 409, message: trung };
  }

  const data = await FlashSale.findByIdAndUpdate(flashSaleId, payload, { new: true, runValidators: true });
  if (!data) return { ok: false, status: 404, message: 'Không tìm thấy Flash Sale' };

  const enriched = await withProductNames(data.toObject());
  return { ok: true, status: 200, data: enriched };
}

async function xoaFlashSale(id) {
  const data = await FlashSale.findByIdAndDelete(id);
  if (!data) return { ok: false, status: 404, message: 'Không tìm thấy Flash Sale' };
  return { ok: true, status: 200, message: 'Đã xóa Flash Sale' };
}

async function batTatFlashSale(id) {
  const flashSaleId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(flashSaleId)) {
    return { ok: false, status: 400, message: 'ID không hợp lệ' };
  }

  const data = await FlashSale.findById(flashSaleId);
  if (!data) return { ok: false, status: 404, message: 'Không tìm thấy Flash Sale' };

  const next = !Boolean(data.hienthi);
  if (next) {
    const now = new Date();
    if (data.batdau > now || data.ketthuc <= now) {
      return {
        ok: false,
        status: 400,
        message: 'Chỉ có thể bật hiển thị trong khoảng thời gian diễn ra Flash Sale'
      };
    }

    const payload = {
      batdau: data.batdau,
      ketthuc: data.ketthuc,
      sanpham: data.sanpham || []
    };
    const trung = await kiemTraTrungSanPhamHoatDong(payload, flashSaleId);
    if (trung) return { ok: false, status: 409, message: trung };
  }

  data.hienthi = next;
  await data.save();
  const enriched = await withProductNames(data.toObject());
  return { ok: true, status: 200, data: enriched };
}

module.exports = {
  getDanhSachData,
  getProductsForAdminForm,
  taoMoiFlashSale,
  capNhatFlashSale,
  xoaFlashSale,
  batTatFlashSale
};
