const mongoose = require('mongoose');
const Coupon = require('../../models/coupon_model');

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function parseNumber(raw, fallback = 0) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseDate(raw, options = {}) {
  const { endOfDay = false } = options || {};
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

function toInputDate(d) {
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function getDanhSachData(query = {}) {
  const keyword = String(query.keyword || '').trim();
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = 10;
  const skip = (page - 1) * limit;

  const filter = { daxoa: { $ne: true } };
  if (keyword) {
    const regex = new RegExp(keyword, 'i');
    filter.$or = [{ code: regex }, { ten: regex }];
  }

  const total = await Coupon.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const vouchers = await Coupon.find(filter)
    .sort({ ngaytao: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Voucher',
      vouchers: vouchers || [],
      keyword,
      page,
      totalPages,
      total
    }
  };
}

function getTaoMoiData() {
  const now = new Date();
  const nextMonth = new Date(now.getTime());
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Tạo voucher',
      defaultStart: toInputDate(now),
      defaultEnd: toInputDate(nextMonth)
    }
  };
}

async function getSuaData(id) {
  const vid = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(vid)) return { ok: false, status: 404, message: 'Không tìm thấy voucher' };

  const voucher = await Coupon.findById(vid).lean();
  if (!voucher) return { ok: false, status: 404, message: 'Không tìm thấy voucher' };

  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Chỉnh sửa voucher',
      voucher,
      defaultStart: toInputDate(voucher.ngay_batdau || voucher.ngaytao || new Date()),
      defaultEnd: toInputDate(voucher.ngay_ketthuc || new Date())
    }
  };
}

async function taoMoiVoucher({ body = {}, file = null }) {
  const code = normalizeCode(body.code);
  const ten = String(body.ten || '').trim();
  const mota = String(body.mota || '').trim();
  const loai = String(body.loai || '').trim();
  const giatri = parseNumber(body.giatri, 0);
  const don_toithieu = parseNumber(body.don_toithieu, 0);
  const giam_toida = parseNumber(body.giam_toida, 0);
  const soluong_toida = parseNumber(body.soluong_toida, 0);
  const ngay_batdau = parseDate(body.ngay_batdau) || (() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  })();
  const ngay_ketthuc = parseDate(body.ngay_ketthuc, { endOfDay: true });
  const trangthai = String(body.trangthai || 'active');

  if (!code) return { ok: false, status: 400, message: 'Vui lòng nhập mã voucher' };
  if (!loai || !['phantram', 'tientruc_tiep'].includes(loai)) return { ok: false, status: 400, message: 'Loại voucher không hợp lệ' };
  if (!Number.isFinite(giatri) || giatri <= 0) return { ok: false, status: 400, message: 'Giá trị voucher không hợp lệ' };
  if (!ngay_ketthuc) return { ok: false, status: 400, message: 'Vui lòng chọn ngày kết thúc' };

  const existed = await Coupon.findOne({ code }).select('_id').lean();
  if (existed) return { ok: false, status: 409, message: 'Mã voucher đã tồn tại' };

  const banner = file && file.filename ? `/uploads/vouchers/${file.filename}` : '';

  const voucher = await Coupon.create({
    code,
    ten,
    mota,
    banner,
    loai,
    giatri,
    don_toithieu,
    giam_toida: loai === 'phantram' ? giam_toida : undefined,
    soluong_toida: soluong_toida > 0 ? soluong_toida : 0,
    soluong_dasudung: 0,
    ngay_batdau,
    ngay_ketthuc,
    trangthai: trangthai === 'inactive' ? 'inactive' : 'active'
  });

  return { ok: true, status: 201, message: `Đã tạo voucher ${voucher.code}`, data: voucher };
}

async function capNhatVoucher({ id, body = {}, file = null }) {
  const vid = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(vid)) return { ok: false, status: 400, message: 'ID voucher không hợp lệ' };

  const voucher = await Coupon.findById(vid);
  if (!voucher) return { ok: false, status: 404, message: 'Không tìm thấy voucher' };

  const code = normalizeCode(body.code);
  const ten = String(body.ten || '').trim();
  const mota = String(body.mota || '').trim();
  const loai = String(body.loai || '').trim();
  const giatri = parseNumber(body.giatri, 0);
  const don_toithieu = parseNumber(body.don_toithieu, 0);
  const giam_toida = parseNumber(body.giam_toida, 0);
  const soluong_toida = parseNumber(body.soluong_toida, 0);
  const ngay_batdau = parseDate(body.ngay_batdau) || voucher.ngay_batdau || (() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  })();
  const ngay_ketthuc = parseDate(body.ngay_ketthuc, { endOfDay: true }) || voucher.ngay_ketthuc;
  const trangthai = String(body.trangthai || 'active');

  if (!code) return { ok: false, status: 400, message: 'Vui lòng nhập mã voucher' };
  if (!loai || !['phantram', 'tientruc_tiep'].includes(loai)) return { ok: false, status: 400, message: 'Loại voucher không hợp lệ' };
  if (!Number.isFinite(giatri) || giatri <= 0) return { ok: false, status: 400, message: 'Giá trị voucher không hợp lệ' };
  if (!ngay_ketthuc) return { ok: false, status: 400, message: 'Vui lòng chọn ngày kết thúc' };

  if (code !== voucher.code) {
    const existed = await Coupon.findOne({ code }).select('_id').lean();
    if (existed) return { ok: false, status: 409, message: 'Mã voucher đã tồn tại' };
  }

  const banner = file && file.filename ? `/uploads/vouchers/${file.filename}` : (voucher.banner || '');

  voucher.code = code;
  voucher.ten = ten;
  voucher.mota = mota;
  voucher.banner = banner;
  voucher.loai = loai;
  voucher.giatri = giatri;
  voucher.don_toithieu = don_toithieu;
  voucher.giam_toida = loai === 'phantram' ? giam_toida : undefined;
  voucher.soluong_toida = soluong_toida > 0 ? soluong_toida : 0;
  voucher.ngay_batdau = ngay_batdau;
  voucher.ngay_ketthuc = ngay_ketthuc;
  voucher.trangthai = trangthai === 'inactive' ? 'inactive' : 'active';

  await voucher.save();

  return { ok: true, status: 200, message: `Đã cập nhật voucher ${voucher.code}`, data: voucher };
}

async function toggleStatus(id) {
  const vid = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(vid)) return { ok: false, status: 400, message: 'ID voucher không hợp lệ' };

  const voucher = await Coupon.findById(vid);
  if (!voucher) return { ok: false, status: 404, message: 'Không tìm thấy voucher' };

  voucher.trangthai = voucher.trangthai === 'active' ? 'inactive' : 'active';
  await voucher.save();

  return {
    ok: true,
    status: 200,
    message: `Đã cập nhật trạng thái ${voucher.code}`,
    data: { trangthai: voucher.trangthai }
  };
}

module.exports = {
  getDanhSachData,
  getTaoMoiData,
  getSuaData,
  taoMoiVoucher,
  capNhatVoucher,
  toggleStatus
};
