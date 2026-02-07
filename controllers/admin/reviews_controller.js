const mongoose = require('mongoose');
const Danhgia = require('../../models/review_model');
const Sanpham = require('../../models/product_model');
const Nguoidung = require('../../models/user_model');
const Donhang = require('../../models/order_model');
const paginationHelper = require('../../helpers/pagination');
const { thoatBieuThuc } = require('../../helpers/validators');

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

module.exports.danhSach = async (req, res) => {
  try {
    const keyword = chuanHoaTuKhoa(req.query.keyword);
    const rating = Number(req.query.rating || 0);
    const visibility = String(req.query.visibility || '').trim();
    const hasImage = String(req.query.hasImage || '').trim();
    const fromDate = phanTichNgay(req.query.fromDate);
    const toDate = phanTichNgay(req.query.toDate);
    const reported = String(req.query.reported || '').trim();

    const limitRaw = parseInt(req.query.limit, 10);
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
      const [products, users, orders] = await Promise.all([
        Sanpham.find({ tensanpham: { $regex: keyword, $options: 'i' } }).select('_id').lean(),
        Nguoidung.find({ $or: [{ hoten: { $regex: keyword, $options: 'i' } }, { email: { $regex: keyword, $options: 'i' } }] }).select('_id').lean(),
        Donhang.find({ madonhang: { $regex: keyword, $options: 'i' } }).select('_id').lean()
      ]);

      const productIds = products.map(p => p._id);
      const userIds = users.map(u => u._id);
      const orderIds = orders.map(o => o._id);

      boloc.$or = [
        { sanpham_id: { $in: productIds } },
        { nguoidung_id: { $in: userIds } },
        { donhang_id: { $in: orderIds } }
      ];
    }

    const tong = await Danhgia.countDocuments(boloc);
    let phantrang = { currentPage: 1, limit };
    phantrang = paginationHelper(phantrang, req.query, tong);

    const danhsach = await Danhgia.find(boloc)
      .sort({ ngaytao: -1 })
      .skip(phantrang.skip)
      .limit(phantrang.limit)
      .populate('sanpham_id', 'tensanpham')
      .populate('nguoidung_id', 'hoten email')
      .lean();

    const filterString = taoChuoiBoLoc({
      keyword: keyword || '',
      rating: rating || '',
      visibility: visibility || '',
      hasImage: hasImage || '',
      reported: reported || '',
      fromDate: req.query.fromDate || '',
      toDate: req.query.toDate || '',
      limit
    });

    return res.render('admin/pages/reviews/index.pug', {
      titlePage: 'Quản lý đánh giá',
      reviews: danhsach || [],
      filters: {
        keyword,
        rating: rating || '',
        visibility,
        hasImage,
        reported,
        fromDate: req.query.fromDate || '',
        toDate: req.query.toDate || '',
        limit
      },
      pagination: phantrang,
      filterString
    });
  } catch (err) {
    console.error('admin reviews index error:', err);
    req.flash('error', 'Không thể tải danh sách đánh giá');
    return res.render('admin/pages/reviews/index.pug', {
      titlePage: 'Quản lý đánh giá',
      reviews: [],
      filters: { keyword: '', rating: '', visibility: '', hasImage: '', reported: '', fromDate: '', toDate: '', limit: 10 },
      pagination: { currentPage: 1, limit: 10, skip: 0, totalPages: 0, totalProducts: 0 },
      filterString: ''
    });
  }
};

module.exports.capNhatHienThi = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'Đánh giá không hợp lệ');
      return res.redirect('/admin/reviews');
    }

    const action = String(req.body.action || '').trim();
    const lydo = String(req.body.reason || '').trim();
    const hienthi = action !== 'hide';

    await Danhgia.updateOne(
      { _id: id, daxoa: { $ne: true } },
      {
        $set: {
          hienthi,
          lydoan: lydo || undefined,
          anboi: req.user?._id || null,
          ngaycapnhat: new Date(),
          ngayan: hienthi ? undefined : new Date()
        }
      }
    );

    req.flash('success', hienthi ? 'Đã hiện đánh giá' : 'Đã ẩn đánh giá');
    return res.redirect('/admin/reviews');
  } catch (err) {
    console.error('admin review visibility error:', err);
    req.flash('error', 'Không thể cập nhật trạng thái đánh giá');
    return res.redirect('/admin/reviews');
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'Đánh giá không hợp lệ');
      return res.redirect('/admin/reviews');
    }

    await Danhgia.updateOne(
      { _id: id, daxoa: { $ne: true } },
      { $set: { daxoa: true, xoaBoi: req.user?._id || null, ngayxoa: new Date() } }
    );

    req.flash('success', 'Đã xóa đánh giá');
    return res.redirect('/admin/reviews');
  } catch (err) {
    console.error('admin review delete error:', err);
    req.flash('error', 'Không thể xóa đánh giá');
    return res.redirect('/admin/reviews');
  }
};

module.exports.thongKe = async (req, res) => {
  try {
    const total = await Danhgia.countDocuments({ daxoa: { $ne: true } });
    const byStar = await Danhgia.aggregate([
      { $match: { daxoa: { $ne: true } } },
      { $group: { _id: '$diem', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);
    const hidden = await Danhgia.countDocuments({ daxoa: { $ne: true }, hienthi: false });

    return res.json({ success: true, data: { total, hidden, byStar } });
  } catch (err) {
    console.error('admin reviews stats error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy thống kê' });
  }
};
