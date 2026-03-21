const mongoose = require('mongoose');
const Danhgia = require('../../models/review_model');
const Sanpham = require('../../models/product_model');
const Nguoidung = require('../../models/user_model');
const Donhang = require('../../models/order_model');
const paginationHelper = require('../../helpers/pagination');
const { thoatBieuThuc } = require('../../helpers/validators');

const DEFAULT_REVIEWS_URL = '/admin/reviews';

function chuanHoaTuKhoa(raw) {
  const k = String(raw || '').trim();
  if (!k) return '';
  return thoatBieuThuc(k.slice(0, 100));
}

function phanTichNgay(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function taoChuoiBoLoc({ keyword, rating, visibility, hasImage, reported, fromDate, toDate, limit }) {
  let s = '';
  if (keyword) s += `&keyword=${encodeURIComponent(keyword)}`;
  if (rating) s += `&rating=${encodeURIComponent(rating)}`;
  if (visibility) s += `&visibility=${encodeURIComponent(visibility)}`;
  if (hasImage) s += `&hasImage=${encodeURIComponent(hasImage)}`;
  if (reported) s += `&reported=${encodeURIComponent(reported)}`;
  if (fromDate) s += `&fromDate=${encodeURIComponent(fromDate)}`;
  if (toDate) s += `&toDate=${encodeURIComponent(toDate)}`;
  if (limit) s += `&limit=${encodeURIComponent(limit)}`;
  return s;
}

function getDanhSachFallbackData() {
  return {
    titlePage: 'Quản lý đánh giá',
    reviews: [],
    filters: { keyword: '', rating: '', visibility: '', hasImage: '', reported: '', fromDate: '', toDate: '', limit: 10 },
    pagination: { currentPage: 1, limit: 10, skip: 0, totalPages: 0, totalProducts: 0 },
    filterString: ''
  };
}

function layDuongDanDanhSachMacDinh() {
  return DEFAULT_REVIEWS_URL;
}

function xacDinhLoaiFlashKetQua(result) {
  return result && result.ok ? 'success' : 'error';
}

function normalizeMediaUrl(rawUrl) {
  let val = String(rawUrl || '').trim();
  if (!val) return '';

  val = val.replace(/\\/g, '/');

  if (/^https?:\/\//i.test(val) || val.startsWith('//')) return val;

  const lower = val.toLowerCase();
  if (lower.startsWith('/public/uploads/')) return val.slice('/public'.length);
  if (lower.startsWith('public/uploads/')) return `/${val.slice('public/'.length)}`;
  if (lower.startsWith('/uploads/')) return val;
  if (lower.startsWith('uploads/')) return `/${val}`;

  const uploadsAt = lower.indexOf('/uploads/');
  if (uploadsAt >= 0) return val.slice(uploadsAt);

  const uploadsNoSlashAt = lower.indexOf('uploads/');
  if (uploadsNoSlashAt >= 0) return `/${val.slice(uploadsNoSlashAt)}`;

  return val.startsWith('/') ? val : `/${val}`;
}

function normalizeMediaList(list) {
  return Array.from(new Set(
    (Array.isArray(list) ? list : [])
      .map((item) => normalizeMediaUrl(item))
      .filter(Boolean)
  ));
}

function lamTronDiem(diem) {
  const n = Number(diem || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

async function layThongKeTheoSanPham(productIds = []) {
  const ids = Array.from(new Set(
    (Array.isArray(productIds) ? productIds : [])
      .map((id) => String(id || '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  )).map((id) => new mongoose.Types.ObjectId(id));

  if (!ids.length) return new Map();

  const rows = await Danhgia.aggregate([
    {
      $match: {
        daxoa: { $ne: true },
        sanpham_id: { $in: ids }
      }
    },
    {
      $group: {
        _id: '$sanpham_id',
        avgRating: { $avg: '$diem' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  return new Map((rows || []).map((r) => [
    String(r._id),
    {
      avgRating: lamTronDiem(r.avgRating),
      totalReviews: Number(r.totalReviews || 0)
    }
  ]));
}

function layDuongDanChiTietDanhGia(id) {
  return `${DEFAULT_REVIEWS_URL}/${encodeURIComponent(String(id || '').trim())}`;
}

async function taoBoLocTheoTuKhoa(keyword) {
  const [products, users, orders] = await Promise.all([
    Sanpham.find({ tensanpham: { $regex: keyword, $options: 'i' } }).select('_id').lean(),
    Nguoidung.find({ $or: [{ hoten: { $regex: keyword, $options: 'i' } }, { email: { $regex: keyword, $options: 'i' } }] }).select('_id').lean(),
    Donhang.find({ madonhang: { $regex: keyword, $options: 'i' } }).select('_id').lean()
  ]);

  return {
    productIds: products.map((p) => p._id),
    userIds: users.map((u) => u._id),
    orderIds: orders.map((o) => o._id)
  };
}

async function getDanhSachData(query = {}) {
  const keyword = chuanHoaTuKhoa(query.keyword);
  const rating = Number(query.rating || 0);
  const visibility = String(query.visibility || '').trim();
  const hasImage = String(query.hasImage || '').trim();
  const fromDate = phanTichNgay(query.fromDate);
  const toDate = phanTichNgay(query.toDate);
  const reported = String(query.reported || '').trim();

  const limitRaw = parseInt(query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(10, limitRaw)) : 10;

  const boloc = { daxoa: { $ne: true } };
  if (rating >= 1 && rating <= 5) boloc.diem = rating;
  if (visibility === 'visible') boloc.hienthi = true;
  if (visibility === 'hidden') boloc.hienthi = false;
  if (hasImage === 'yes') boloc.hinhanh = { $exists: true, $ne: [] };
  if (hasImage === 'no') boloc.$or = [{ hinhanh: { $exists: false } }, { hinhanh: { $size: 0 } }];
  if (reported === 'yes') boloc.biBaoCao = true;
  if (reported === 'no') boloc.biBaoCao = { $ne: true };

  if (fromDate || toDate) {
    const range = {};
    if (fromDate) {
      fromDate.setHours(0, 0, 0, 0);
      range.$gte = fromDate;
    }
    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
      range.$lte = toDate;
    }
    boloc.ngaytao = range;
  }

  if (keyword) {
    const { productIds, userIds, orderIds } = await taoBoLocTheoTuKhoa(keyword);
    boloc.$or = [
      { sanpham_id: { $in: productIds } },
      { nguoidung_id: { $in: userIds } },
      { donhang_id: { $in: orderIds } }
    ];
  }

  const tong = await Danhgia.countDocuments(boloc);
  let phantrang = { currentPage: 1, limit };
  phantrang = paginationHelper(phantrang, query, tong);

  const danhsach = await Danhgia.find(boloc)
    .sort({ ngaytao: -1 })
    .skip(phantrang.skip)
    .limit(phantrang.limit)
    .populate('sanpham_id', 'tensanpham')
    .populate('nguoidung_id', 'hoten email')
    .lean();

  const productStatsMap = await layThongKeTheoSanPham((danhsach || []).map((r) => r.sanpham_id && r.sanpham_id._id));
  const reviews = (danhsach || []).map((r) => ({
    ...r,
    productStats: productStatsMap.get(String(r.sanpham_id && r.sanpham_id._id)) || { avgRating: 0, totalReviews: 0 }
  }));

  const filterString = taoChuoiBoLoc({
    keyword: keyword || '',
    rating: rating || '',
    visibility: visibility || '',
    hasImage: hasImage || '',
    reported: reported || '',
    fromDate: query.fromDate || '',
    toDate: query.toDate || '',
    limit
  });

  return {
    titlePage: 'Quản lý đánh giá',
    reviews,
    filters: {
      keyword,
      rating: rating || '',
      visibility,
      hasImage,
      reported,
      fromDate: query.fromDate || '',
      toDate: query.toDate || '',
      limit
    },
    pagination: phantrang,
    filterString
  };
}

async function capNhatHienThi({ id, action, reason, actorId }) {
  const reviewId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    return { ok: false, message: 'Đánh giá không hợp lệ', redirect: DEFAULT_REVIEWS_URL };
  }

  const lydo = String(reason || '').trim();
  const hienthi = String(action || '').trim() !== 'hide';

  await Danhgia.updateOne(
    { _id: reviewId, daxoa: { $ne: true } },
    {
      $set: {
        hienthi,
        lydoan: lydo || undefined,
        anboi: actorId || null,
        ngaycapnhat: new Date(),
        ngayan: hienthi ? undefined : new Date()
      }
    }
  );

  return {
    ok: true,
    message: hienthi ? 'Đã hiện đánh giá' : 'Đã ẩn đánh giá',
    redirect: DEFAULT_REVIEWS_URL
  };
}

async function xoaDanhGia({ id, actorId }) {
  const reviewId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    return { ok: false, message: 'Đánh giá không hợp lệ', redirect: DEFAULT_REVIEWS_URL };
  }

  await Danhgia.updateOne(
    { _id: reviewId, daxoa: { $ne: true } },
    { $set: { daxoa: true, xoaBoi: actorId || null, ngayxoa: new Date() } }
  );

  return { ok: true, message: 'Đã xóa đánh giá', redirect: DEFAULT_REVIEWS_URL };
}

async function getChiTietData(id) {
  const reviewId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    return { ok: false, message: 'Đánh giá không hợp lệ', redirect: DEFAULT_REVIEWS_URL };
  }

  const review = await Danhgia.findOne({ _id: reviewId, daxoa: { $ne: true } })
    .populate('sanpham_id', 'tensanpham hinhanh')
    .populate('nguoidung_id', 'hoten email avatar')
    .populate('donhang_id', 'madonhang')
    .populate('anboi', 'hoten email')
    .populate('xoaBoi', 'hoten email')
    .lean();

  if (!review) {
    return { ok: false, message: 'Không tìm thấy đánh giá', redirect: DEFAULT_REVIEWS_URL };
  }

  review.hinhanh = normalizeMediaList(review.hinhanh);
  review.videos = normalizeMediaList(review.videos);

  const statsMap = await layThongKeTheoSanPham([review.sanpham_id && review.sanpham_id._id]);
  const productStats = statsMap.get(String(review.sanpham_id && review.sanpham_id._id)) || {
    avgRating: 0,
    totalReviews: 0
  };

  return {
    ok: true,
    data: {
      titlePage: 'Chi tiết đánh giá',
      review,
      productStats,
      listUrl: DEFAULT_REVIEWS_URL
    }
  };
}

module.exports = {
  getDanhSachData,
  getDanhSachFallbackData,
  getChiTietData,
  capNhatHienThi,
  xoaDanhGia,
  xacDinhLoaiFlashKetQua,
  layDuongDanDanhSachMacDinh,
  layDuongDanChiTietDanhGia
};
