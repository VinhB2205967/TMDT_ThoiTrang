const mongoose = require('mongoose');
const SizeGuide = require('../../models/size_guide_model');
const Danhmuc = require('../../models/category_model');
const {
  taoSlug,
  tachCot,
  tachDong,
  dongToText,
  damBaoBangSizeMacDinh
} = require('./sizeGuide.service.js');

const LOAI_SAN_PHAM_LABEL_MAP = {
  ao: 'Áo',
  aokhoac: 'Áo khoác',
  quan: 'Quần',
  vay: 'Váy',
  giay: 'Giày',
  tui: 'Túi',
  phukien: 'Phụ kiện'
};

function layNhanLoaiSanPham(loaiSanPham) {
  const raw = String(loaiSanPham || '').trim();
  if (!raw) return '';

  const normalized = raw
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  return LOAI_SAN_PHAM_LABEL_MAP[normalized] || raw;
}

async function loaiSanPhamOptions() {
  const danhMucLoaiSp = await Danhmuc.find({
    daxoa: { $ne: true },
    type: 'category',
    isActive: true,
    parent_id: { $ne: null }
  })
    .sort({ order: 1, thutu: 1, name: 1, tendanhmuc: 1 })
    .select('name tendanhmuc slug')
    .lean();

  const mapTheoSlug = new Map();
  for (const item of danhMucLoaiSp || []) {
    const slug = String(item?.slug || '').trim();
    if (!slug || mapTheoSlug.has(slug)) continue;
    const label = String(item?.name || item?.tendanhmuc || slug).trim();
    mapTheoSlug.set(slug, { value: slug, label });
  }

  const options = Array.from(mapTheoSlug.values());
  if (options.length) return options;

  return [
    { value: 'ao', label: 'Áo' },
    { value: 'quan', label: 'Quần' },
    { value: 'vay', label: 'Váy' },
    { value: 'aokhoac', label: 'Áo khoác' },
    { value: 'phukien', label: 'Phụ kiện' },
    { value: 'giay', label: 'Giày' },
    { value: 'tui', label: 'Túi' }
  ];
}

async function getDanhSachData() {
  await damBaoBangSizeMacDinh(SizeGuide);
  const guidesRaw = await SizeGuide.find({ daxoa: { $ne: true } })
    .sort({ loaisanpham: 1, ngaycapnhat: -1 })
    .lean();

  const guides = (guidesRaw || []).map((guide) => ({
    ...guide,
    loaisanphamLabel: layNhanLoaiSanPham(guide.loaisanpham)
  }));

  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Bảng hướng dẫn chọn size',
      guides
    }
  };
}

async function getTaoMoiData() {
  const options = await loaiSanPhamOptions();
  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Thêm bảng hướng dẫn size',
      loaiOptions: options
    }
  };
}

async function taoMoiGuide(body = {}) {
  const tenbang = String(body.tenbang || '').trim();
  const loaisanpham = String(body.loaisanpham || '').trim();
  const cot = tachCot(body.cot);
  const dong = tachDong(body.dong, cot.length);
  const goiy = String(body.goiy || '').trim();

  if (!tenbang) return { ok: false, status: 400, message: 'Tên bảng size là bắt buộc' };
  if (!loaisanpham) return { ok: false, status: 400, message: 'Loại sản phẩm áp dụng là bắt buộc' };
  if (!cot.length) return { ok: false, status: 400, message: 'Cần ít nhất 1 cột kích thước' };
  if (!dong.length) return { ok: false, status: 400, message: 'Cần ít nhất 1 dòng size' };

  const baseSlug = taoSlug(body.slug || tenbang) || taoSlug(tenbang);
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

  const options = await loaiSanPhamOptions();
  const coGiaTriHienTai = options.some((opt) => String(opt.value) === String(guide.loaisanpham || ''));
  if (!coGiaTriHienTai && guide.loaisanpham) {
    options.push({
      value: String(guide.loaisanpham),
      label: layNhanLoaiSanPham(guide.loaisanpham)
    });
  }

  const guideForm = {
    ...guide,
    cotText: (guide.cot || []).join(', '),
    dongText: dongToText(guide.dong)
  };

  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Chỉnh sửa bảng hướng dẫn size',
      guide: guideForm,
      loaiOptions: options
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
  const cot = tachCot(body.cot);
  const dong = tachDong(body.dong, cot.length);
  const goiy = String(body.goiy || '').trim();

  if (!tenbang) return { ok: false, status: 400, message: 'Tên bảng size là bắt buộc' };
  if (!loaisanpham) return { ok: false, status: 400, message: 'Loại sản phẩm áp dụng là bắt buộc' };
  if (!cot.length) return { ok: false, status: 400, message: 'Cần ít nhất 1 cột kích thước' };
  if (!dong.length) return { ok: false, status: 400, message: 'Cần ít nhất 1 dòng size' };

  let nextSlug = String(body.slug || guide.slug || tenbang).trim();
  nextSlug = taoSlug(nextSlug);

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

