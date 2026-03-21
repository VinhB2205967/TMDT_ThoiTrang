const mongoose = require('mongoose');
const SizeGuide = require('../../models/size_guide_model');
const {
  slugify,
  parseColumns,
  parseRows,
  rowsToTextarea,
  ensureDefaultSizeGuides
} = require('./sizeGuide.service.js');

function loaiSanPhamOptions() {
  return [
    { value: 'ao', label: 'Áo / Váy / Áo khoác' },
    { value: 'quan', label: 'Quần' },
    { value: 'giay', label: 'Giày dép' }
  ];
}

async function getDanhSachData() {
  await ensureDefaultSizeGuides(SizeGuide);
  const guides = await SizeGuide.find({ daxoa: { $ne: true } })
    .sort({ loaisanpham: 1, ngaycapnhat: -1 })
    .lean();

  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Bảng hướng dẫn chọn size',
      guides
    }
  };
}

function getTaoMoiData() {
  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Thêm bảng hướng dẫn size',
      loaiOptions: loaiSanPhamOptions()
    }
  };
}

async function taoMoiGuide(body = {}) {
  const tenbang = String(body.tenbang || '').trim();
  const loaisanpham = String(body.loaisanpham || '').trim();
  const cot = parseColumns(body.cot);
  const dong = parseRows(body.dong, cot.length);
  const goiy = String(body.goiy || '').trim();

  if (!tenbang) return { ok: false, status: 400, message: 'Tên bảng size là bắt buộc' };
  if (!loaisanpham) return { ok: false, status: 400, message: 'Loại sản phẩm áp dụng là bắt buộc' };
  if (!cot.length) return { ok: false, status: 400, message: 'Cần ít nhất 1 cột kích thước' };
  if (!dong.length) return { ok: false, status: 400, message: 'Cần ít nhất 1 dòng size' };

  const baseSlug = slugify(body.slug || tenbang) || slugify(tenbang);
  let slug = baseSlug;
  let suffix = 1;

  while (await SizeGuide.findOne({ slug, daxoa: { $ne: true } }).select('_id').lean()) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const created = await SizeGuide.create({
    tenbang,
    slug,
    loaisanpham,
    cot,
    dong,
    goiy,
    daxoa: false,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  return { ok: true, status: 201, message: 'Đã tạo bảng hướng dẫn size', data: created };
}

async function getChinhSuaData(id) {
  const gid = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(gid)) {
    return { ok: false, status: 404, message: 'Không tìm thấy bảng size' };
  }

  const guide = await SizeGuide.findOne({ _id: gid, daxoa: { $ne: true } }).lean();
  if (!guide) return { ok: false, status: 404, message: 'Không tìm thấy bảng size' };

  const guideForm = {
    ...guide,
    cotText: (guide.cot || []).join(', '),
    dongText: rowsToTextarea(guide.dong)
  };

  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Chỉnh sửa bảng hướng dẫn size',
      guide: guideForm,
      loaiOptions: loaiSanPhamOptions()
    }
  };
}

async function capNhatGuide(id, body = {}) {
  const gid = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(gid)) return { ok: false, status: 400, message: 'ID bảng size không hợp lệ' };

  const guide = await SizeGuide.findOne({ _id: gid, daxoa: { $ne: true } });
  if (!guide) return { ok: false, status: 404, message: 'Không tìm thấy bảng size' };

  const tenbang = String(body.tenbang || '').trim();
  const loaisanpham = String(body.loaisanpham || '').trim();
  const cot = parseColumns(body.cot);
  const dong = parseRows(body.dong, cot.length);
  const goiy = String(body.goiy || '').trim();

  if (!tenbang) return { ok: false, status: 400, message: 'Tên bảng size là bắt buộc' };
  if (!loaisanpham) return { ok: false, status: 400, message: 'Loại sản phẩm áp dụng là bắt buộc' };
  if (!cot.length) return { ok: false, status: 400, message: 'Cần ít nhất 1 cột kích thước' };
  if (!dong.length) return { ok: false, status: 400, message: 'Cần ít nhất 1 dòng size' };

  let nextSlug = String(body.slug || guide.slug || tenbang).trim();
  nextSlug = slugify(nextSlug);

  const existed = await SizeGuide.findOne({ _id: { $ne: guide._id }, slug: nextSlug, daxoa: { $ne: true } }).select('_id').lean();
  if (existed && existed._id) return { ok: false, status: 409, message: 'Slug đã tồn tại, vui lòng đổi tên/slug' };

  guide.tenbang = tenbang;
  guide.slug = nextSlug;
  guide.loaisanpham = loaisanpham;
  guide.cot = cot;
  guide.dong = dong;
  guide.goiy = goiy;
  guide.ngaycapnhat = new Date();
  await guide.save();

  return { ok: true, status: 200, message: 'Đã cập nhật bảng hướng dẫn size', data: guide };
}

async function xoaGuide(id) {
  const gid = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(gid)) return { ok: false, status: 400, message: 'ID bảng size không hợp lệ' };

  const guide = await SizeGuide.findOne({ _id: gid, daxoa: { $ne: true } });
  if (!guide) return { ok: false, status: 404, message: 'Không tìm thấy bảng size' };

  guide.daxoa = true;
  guide.ngaycapnhat = new Date();
  await guide.save();

  return { ok: true, status: 200, message: 'Đã xóa bảng hướng dẫn size' };
}

module.exports = {
  loaiSanPhamOptions,
  getDanhSachData,
  getTaoMoiData,
  taoMoiGuide,
  getChinhSuaData,
  capNhatGuide,
  xoaGuide
};
