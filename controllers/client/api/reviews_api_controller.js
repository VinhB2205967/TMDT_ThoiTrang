const mongoose = require('mongoose');
const Danhgia = require('../../../models/review_model');
const Donhang = require('../../../models/order_model');
const Chitietdonhang = require('../../../models/order_item_model');

const EDIT_WINDOW_DAYS = 7;

function inEditWindow(review) {
  if (!review || !review.ngaytao) return false;
  const created = new Date(review.ngaytao).getTime();
  if (!Number.isFinite(created)) return false;
  const diffDays = (Date.now() - created) / (24 * 60 * 60 * 1000);
  return diffDays <= EDIT_WINDOW_DAYS;
}

function toArray(input) {
  if (Array.isArray(input)) return input.map((v) => String(v || '').trim()).filter(Boolean);
  if (!input) return [];
  return [String(input).trim()].filter(Boolean);
}

function mapReview(r) {
  return {
    id: String(r._id),
    sanpham_id: r.sanpham_id ? String(r.sanpham_id) : null,
    nguoidung_id: r.nguoidung_id ? String(r.nguoidung_id) : null,
    donhang_id: r.donhang_id ? String(r.donhang_id) : null,
    chitietdonhang_id: r.chitietdonhang_id ? String(r.chitietdonhang_id) : null,
    diem: Number(r.diem || 0),
    noidung: String(r.noidung || ''),
    tags: Array.isArray(r.tags) ? r.tags : [],
    hinhanh: Array.isArray(r.hinhanh) ? r.hinhanh : [],
    videos: Array.isArray(r.videos) ? r.videos : [],
    mausac: String(r.mausac || ''),
    kichco: String(r.kichco || ''),
    trangthai: String(r.trangthai || ''),
    hienthi: Boolean(r.hienthi),
    ngaytao: r.ngaytao || null,
    ngaycapnhat: r.ngaycapnhat || null
  };
}

async function checkReviewPermission({ userId, orderId, itemId, productId }) {
  if (!mongoose.Types.ObjectId.isValid(String(orderId || ''))) return null;

  const order = await Donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!order) return null;
  if (String(order.trangthai) !== 'dagiao') return { order, item: null };

  let item = null;
  if (mongoose.Types.ObjectId.isValid(String(itemId || ''))) {
    item = await Chitietdonhang.findOne({ _id: itemId, donhang_id: orderId }).lean();
  }

  if (!item && mongoose.Types.ObjectId.isValid(String(productId || ''))) {
    item = await Chitietdonhang.findOne({ donhang_id: orderId, sanpham_id: productId }).sort({ ngaytao: 1 }).lean();
  }

  return { order, item };
}

module.exports.listByProduct = async (req, res) => {
  try {
    const productId = String(req.params.productId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'productId không hợp lệ' });
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
    const skip = (page - 1) * limit;
    const rating = Number(req.query.rating || 0);

    const filter = {
      sanpham_id: productId,
      trangthai: 'approved',
      hienthi: true,
      daxoa: { $ne: true }
    };
    if (rating >= 1 && rating <= 5) filter.diem = rating;

    const [rows, total] = await Promise.all([
      Danhgia.find(filter).sort({ ngaytao: -1 }).skip(skip).limit(limit).lean(),
      Danhgia.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: {
        items: (rows || []).map(mapReview),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (err) {
    console.error('reviewsApi.listByProduct error:', err);
    return res.status(500).json({ success: false, message: 'Không thể tải đánh giá' });
  }
};

module.exports.create = async (req, res) => {
  try {
    const orderId = String(req.body.orderId || '').trim();
    const itemId = String(req.body.itemId || '').trim();
    const productId = String(req.body.productId || '').trim();
    const diem = Number(req.body.diem || 0);
    const noidung = String(req.body.noidung || '').trim();
    const tags = toArray(req.body.tags);
    const hinhanh = toArray(req.body.hinhanh).slice(0, 5);
    const videos = toArray(req.body.videos).slice(0, 1);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'productId không hợp lệ' });
    }
    if (!Number.isFinite(diem) || diem < 1 || diem > 5) {
      return res.status(400).json({ success: false, message: 'Diem danh gia phai tu 1 den 5' });
    }
    if (noidung.length < 10) {
      return res.status(400).json({ success: false, message: 'Nội dung tối thiểu 10 ký tự' });
    }

    const permission = await checkReviewPermission({ userId: req.user._id, orderId, itemId, productId });
    if (!permission || !permission.order || !permission.item) {
      return res.status(400).json({ success: false, message: 'Không đủ điều kiện đánh giá' });
    }

    const existed = await Danhgia.findOne({
      nguoidung_id: req.user._id,
      chitietdonhang_id: permission.item._id,
      daxoa: { $ne: true }
    }).lean();
    if (existed) return res.status(409).json({ success: false, message: 'Bạn đã đánh giá sản phẩm này' });

    const created = await Danhgia.create({
      sanpham_id: permission.item.sanpham_id,
      nguoidung_id: req.user._id,
      donhang_id: permission.order._id,
      chitietdonhang_id: permission.item._id,
      diem,
      noidung,
      tags,
      hinhanh,
      videos,
      mausac: permission.item.mausac,
      kichco: permission.item.kichco,
      trangthai: 'approved',
      hienthi: true,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    await Chitietdonhang.updateOne({ _id: permission.item._id }, { $set: { danhgia: true } });

    return res.status(201).json({ success: true, message: 'Da tao danh gia', data: mapReview(created.toObject()) });
  } catch (err) {
    console.error('reviewsApi.create error:', err);
    return res.status(500).json({ success: false, message: 'Không thể tạo đánh giá' });
  }
};

module.exports.update = async (req, res) => {
  try {
    const reviewId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ success: false, message: 'reviewId không hợp lệ' });
    }

    const review = await Danhgia.findOne({ _id: reviewId, nguoidung_id: req.user._id, daxoa: { $ne: true } });
    if (!review) return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
    if (!inEditWindow(review)) {
      return res.status(400).json({ success: false, message: 'Đã quá hạn sửa đánh giá' });
    }

    const diem = Number(req.body.diem || review.diem || 0);
    const noidung = String(req.body.noidung || review.noidung || '').trim();
    const tags = req.body.tags != null ? toArray(req.body.tags) : (Array.isArray(review.tags) ? review.tags : []);
    const hinhanh = req.body.hinhanh != null ? toArray(req.body.hinhanh).slice(0, 5) : (Array.isArray(review.hinhanh) ? review.hinhanh : []);
    const videos = req.body.videos != null ? toArray(req.body.videos).slice(0, 1) : (Array.isArray(review.videos) ? review.videos : []);

    if (!Number.isFinite(diem) || diem < 1 || diem > 5) {
      return res.status(400).json({ success: false, message: 'Diem danh gia phai tu 1 den 5' });
    }
    if (noidung.length < 10) {
      return res.status(400).json({ success: false, message: 'Nội dung tối thiểu 10 ký tự' });
    }

    review.diem = diem;
    review.noidung = noidung;
    review.tags = tags;
    review.hinhanh = hinhanh;
    review.videos = videos;
    review.ngaycapnhat = new Date();
    await review.save();

    return res.json({ success: true, message: 'Da cap nhat danh gia', data: mapReview(review.toObject()) });
  } catch (err) {
    console.error('reviewsApi.update error:', err);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật danh gia' });
  }
};

module.exports.remove = async (req, res) => {
  try {
    const reviewId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ success: false, message: 'reviewId không hợp lệ' });
    }

    const review = await Danhgia.findOne({ _id: reviewId, nguoidung_id: req.user._id, daxoa: { $ne: true } });
    if (!review) return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });

    review.daxoa = true;
    review.ngayxoa = new Date();
    review.xoaBoi = req.user._id;
    review.ngaycapnhat = new Date();
    await review.save();

    return res.json({ success: true, message: 'Da xoa danh gia' });
  } catch (err) {
    console.error('reviewsApi.remove error:', err);
    return res.status(500).json({ success: false, message: 'Không thể xóa đánh giá' });
  }
};


