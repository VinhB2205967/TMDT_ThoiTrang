const mongoose = require('mongoose');
const Brand = require('../../models/brand_model');
const Sanpham = require('../../models/product_model');

function parseBoolean(input, fallback = false) {
  if (input === undefined || input === null || input === '') return fallback;
  if (typeof input === 'boolean') return input;
  const raw = String(input).trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
}

async function kiemTraTrungTen(ten, excludeId = null) {
  const escaped = String(ten || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}$`, 'i');
  const query = {
    daXoa: { $ne: true },
    ten: regex,
    ...(excludeId ? { _id: { $ne: excludeId } } : {})
  };
  return Brand.exists(query);
}

function normalizePayload({ body = {}, file = null, isCreate = false }) {
  const ten = String(body.ten || body.name || '').trim();
  const logo = file && file.filename ? `/uploads/brands/${file.filename}` : String(body.logo || '').trim();
  const moTa = String(body.moTa || body.description || '').trim();

  const payload = {
    ten,
    name: ten,
    description: moTa,
    moTa,
    isActive: parseBoolean(body.hienthi ?? body.isActive, true),
    hienthi: parseBoolean(body.hienthi ?? body.isActive, true),
    isFeatured: parseBoolean(body.noiBat ?? body.isFeatured, false),
    noiBat: parseBoolean(body.noiBat ?? body.isFeatured, false),
    order: Number(body.thuTu ?? body.order ?? 0),
    thuTu: Number(body.thuTu ?? body.order ?? 0)
  };

  if (logo) payload.logo = logo;
  if (!isCreate && !logo) delete payload.logo;
  return payload;
}

async function layDanhSachThuongHieu() {
  const data = await Brand.find({ daXoa: { $ne: true } }).sort({ order: 1, thuTu: 1, ten: 1 }).lean();
  return { ok: true, status: 200, data };
}

async function taoThuongHieu({ body = {}, file = null }) {
  const payload = normalizePayload({ body, file, isCreate: true });
  if (!payload.ten) return { ok: false, status: 400, code: 'NAME_REQUIRED', message: 'Tên thương hiệu là bắt buộc' };
  if (!payload.logo) return { ok: false, status: 400, code: 'LOGO_REQUIRED', message: 'Logo là bắt buộc' };

  const trungTen = await kiemTraTrungTen(payload.ten);
  if (trungTen) return { ok: false, status: 409, code: 'NAME_EXISTS', message: 'Tên thương hiệu đã tồn tại' };

  const data = await Brand.create(payload);
  return { ok: true, status: 201, message: 'Tạo thương hiệu thành công', data };
}

async function capNhatThuongHieu({ id, body = {}, file = null }) {
  const brandId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(brandId)) {
    return { ok: false, status: 400, code: 'INVALID_ID', message: 'ID thương hiệu không hợp lệ' };
  }

  const exists = await Brand.findOne({ _id: brandId, daXoa: { $ne: true } }).lean();
  if (!exists) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Thương hiệu không tồn tại' };

  const payload = normalizePayload({ body, file, isCreate: false });
  if (!payload.ten) return { ok: false, status: 400, code: 'NAME_REQUIRED', message: 'Tên thương hiệu là bắt buộc' };

  const trungTen = await kiemTraTrungTen(payload.ten, brandId);
  if (trungTen) return { ok: false, status: 409, code: 'NAME_EXISTS', message: 'Tên thương hiệu đã tồn tại' };

  const data = await Brand.findByIdAndUpdate(brandId, { $set: payload }, { new: true, runValidators: true });
  return { ok: true, status: 200, message: 'Cập nhật thương hiệu thành công', data };
}

async function xoaThuongHieu({ id }) {
  const brandId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(brandId)) {
    return { ok: false, status: 400, code: 'INVALID_ID', message: 'ID thương hiệu không hợp lệ' };
  }

  const brand = await Brand.findOne({ _id: brandId, daXoa: { $ne: true } }).lean();
  if (!brand) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Thương hiệu không tồn tại' };

  const dangDuocSuDung = await Sanpham.countDocuments({
    daxoa: { $ne: true },
    $or: [{ brand: brandId }, { thuonghieu_id: brandId }]
  });

  if (dangDuocSuDung > 0) {
    return { ok: false, status: 400, code: 'BRAND_IN_USE', message: 'Không thể xóa thương hiệu đang có sản phẩm' };
  }

  await Brand.findByIdAndUpdate(brandId, {
    $set: { daXoa: true, deletedAt: new Date(), isActive: false, hienthi: false }
  });

  return { ok: true, status: 200, message: 'Đã xóa thương hiệu' };
}

async function capNhatNoiBat({ id, body = {} }) {
  const brandId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(brandId)) return { ok: false, status: 400, code: 'INVALID_ID', message: 'ID không hợp lệ' };

  const data = await Brand.findOne({ _id: brandId, daXoa: { $ne: true } }).select('_id noiBat isFeatured').lean();
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy thương hiệu' };

  const next = body.noiBat !== undefined
    ? parseBoolean(body.noiBat, Boolean(data.noiBat || data.isFeatured))
    : !Boolean(data.noiBat || data.isFeatured);

  const updated = await Brand.findByIdAndUpdate(
    brandId,
    { $set: { noiBat: next, isFeatured: next } },
    { new: true }
  ).lean();

  return { ok: true, status: 200, message: 'Cập nhật nổi bật thành công', data: updated };
}

async function capNhatHienThi({ id, body = {} }) {
  const brandId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(brandId)) return { ok: false, status: 400, code: 'INVALID_ID', message: 'ID không hợp lệ' };

  const data = await Brand.findOne({ _id: brandId, daXoa: { $ne: true } }).select('_id hienthi isActive').lean();
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy thương hiệu' };

  const next = body.hienthi !== undefined
    ? parseBoolean(body.hienthi, Boolean(data.hienthi || data.isActive))
    : !Boolean(data.hienthi || data.isActive);

  const updated = await Brand.findByIdAndUpdate(
    brandId,
    { $set: { hienthi: next, isActive: next } },
    { new: true }
  ).lean();

  return { ok: true, status: 200, message: 'Cập nhật hiển thị thành công', data: updated };
}

async function sapXepThuongHieu({ items = [] }) {
  const bulk = (Array.isArray(items) ? items : [])
    .filter((item) => mongoose.Types.ObjectId.isValid(item.id))
    .map((item) => ({
      updateOne: {
        filter: { _id: item.id, daXoa: { $ne: true } },
        update: {
          $set: {
            thuTu: Number(item.thuTu || item.order || 0),
            order: Number(item.thuTu || item.order || 0)
          }
        }
      }
    }));

  if (bulk.length) await Brand.bulkWrite(bulk);
  return { ok: true, status: 200, message: 'Cập nhật thứ tự thành công' };
}

module.exports = {
  layDanhSachThuongHieu,
  taoThuongHieu,
  capNhatThuongHieu,
  xoaThuongHieu,
  capNhatNoiBat,
  capNhatHienThi,
  sapXepThuongHieu
};
