const mongoose = require('mongoose');
const Danhgia = require('../../models/review_model');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');

const TAGS_NHANH = ['Đẹp', 'Đúng mô tả', 'Giao nhanh', 'Vải ok', 'Sai size'];
const EDIT_WINDOW_DAYS = 7;
const MAX_REVIEW_IMAGES = 5;
const MAX_REVIEW_VIDEOS = 1;
const MAX_IMAGE_SIZE_MB = 20;
const MAX_VIDEO_SIZE_MB = 100;

function isVideoUrl(url) {
  return /\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(String(url || ''));
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

function splitMediaUrls(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const images = [];
  const videos = [];
  list.forEach((url) => {
    const val = normalizeMediaUrl(url);
    if (!val) return;
    if (isVideoUrl(val)) videos.push(val);
    else images.push(val);
  });
  return { images, videos };
}

function extractMediaFromRequestFiles(files) {
  if (!files) return { images: [], videos: [] };

  const images = [];
  const videos = [];

  if (Array.isArray(files)) {
    files.forEach((f) => {
      if (!f || !f.filename) return;
      const url = `/uploads/reviews/${f.filename}`;
      if (String(f.mimetype || '').startsWith('video/')) videos.push(url);
      else images.push(url);
    });
    return { images, videos };
  }

  const fileGroups = []
    .concat(Array.isArray(files.images) ? files.images : [])
    .concat(Array.isArray(files.videos) ? files.videos : [])
    .concat(Array.isArray(files.hinhanh) ? files.hinhanh : []);

  fileGroups.forEach((f) => {
    if (!f || !f.filename) return;
    const url = `/uploads/reviews/${f.filename}`;
    if (String(f.mimetype || '').startsWith('video/')) videos.push(url);
    else images.push(url);
  });

  return { images, videos };
}

function collectUploadedFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return []
    .concat(Array.isArray(files.images) ? files.images : [])
    .concat(Array.isArray(files.videos) ? files.videos : [])
    .concat(Array.isArray(files.hinhanh) ? files.hinhanh : []);
}

function validateUploadedFileSizes(files) {
  const allFiles = collectUploadedFiles(files);
  const maxImageBytes = MAX_IMAGE_SIZE_MB * 1024 * 1024;
  const maxVideoBytes = MAX_VIDEO_SIZE_MB * 1024 * 1024;
  for (const file of allFiles) {
    const size = Number(file && file.size ? file.size : 0);
    const mime = String(file && file.mimetype ? file.mimetype : '');
    if (mime.startsWith('video/') && size > maxVideoBytes) {
      return `Video vượt quá ${MAX_VIDEO_SIZE_MB}MB`;
    }
    if (mime.startsWith('image/') && size > maxImageBytes) {
      return `Ảnh vượt quá ${MAX_IMAGE_SIZE_MB}MB`;
    }
  }
  return '';
}

function parseRemoveList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

function normalizeReviewMedia(review) {
  const old = splitMediaUrls(review && review.hinhanh);
  const videos = old.videos.concat(
    (Array.isArray(review && review.videos) ? review.videos : [])
      .map((v) => normalizeMediaUrl(v))
      .filter(Boolean)
  );
  return {
    images: old.images,
    videos: Array.from(new Set(videos.map((v) => String(v || '').trim()).filter(Boolean)))
  };
}

function isEditableWithinWindow(review) {
  if (!review || !review.ngaytao) return false;
  const created = new Date(review.ngaytao).getTime();
  if (!Number.isFinite(created)) return false;
  const diffDays = (Date.now() - created) / (24 * 60 * 60 * 1000);
  return diffDays <= EDIT_WINDOW_DAYS;
}

function normalizeTags(rawTags) {
  return Array.isArray(rawTags)
    ? rawTags.map((t) => String(t))
    : (rawTags ? [String(rawTags)] : []);
}

async function kiemTraQuyenDanhGia({ userId, orderId, itemId, productId }) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;
  const hasValidItemId = mongoose.Types.ObjectId.isValid(itemId);
  const hasValidProductId = mongoose.Types.ObjectId.isValid(productId);

  const order = await Donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!order) return null;
  if (String(order.trangthai) !== 'dagiao') return { order, item: null };

  let item = null;
  if (hasValidItemId) {
    item = await Chitietdonhang.findOne({
      _id: itemId,
      donhang_id: orderId,
      ...(hasValidProductId ? { sanpham_id: productId } : {})
    }).lean();
  }

  if (!item && hasValidProductId) {
    item = await Chitietdonhang.findOne({
      donhang_id: orderId,
      sanpham_id: productId
    }).sort({ ngaytao: 1 }).lean();
  }

  return { order, item };
}

async function getCreatePageData({ userId, orderId, itemId, productId }) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return { ok: false, error: 'Sản phẩm không hợp lệ', redirect: '/orders' };
  }

  const quyen = await kiemTraQuyenDanhGia({ userId, orderId, itemId, productId });

  if (!quyen || !quyen.order) {
    return { ok: false, error: 'Không thể đánh giá đơn hàng này', redirect: '/orders' };
  }

  if (!quyen.item) {
    return { ok: false, error: 'Không tìm thấy sản phẩm trong đơn', redirect: `/orders/${orderId}` };
  }

  const existing = await Danhgia.findOne({
    nguoidung_id: userId,
    chitietdonhang_id: quyen.item._id,
    daxoa: { $ne: true }
  }).lean();

  if (existing) {
    const canEdit = isEditableWithinWindow(existing);
    const media = normalizeReviewMedia(existing);
    return {
      ok: true,
      viewData: {
        titlePage: 'Sửa đánh giá',
        order: quyen.order,
        item: quyen.item,
        productId,
        review: existing,
        reviewImages: media.images,
        reviewVideos: media.videos,
        tags: TAGS_NHANH,
        canEdit,
        editWindowDays: EDIT_WINDOW_DAYS
      }
    };
  }

  return {
    ok: true,
    viewData: {
      titlePage: 'Đánh giá sản phẩm',
      order: quyen.order,
      item: quyen.item,
      productId,
      review: null,
      reviewImages: [],
      reviewVideos: [],
      tags: TAGS_NHANH,
      canEdit: true,
      editWindowDays: EDIT_WINDOW_DAYS
    }
  };
}

async function createReview({ userId, body, files }) {
  const orderId = String(body && body.orderId ? body.orderId : '').trim();
  const itemId = String(body && body.itemId ? body.itemId : '').trim();
  const productId = String(body && body.productId ? body.productId : '').trim();

  const diem = Number(body && body.diem ? body.diem : 0);
  const noidung = String(body && body.noidung ? body.noidung : '').trim();
  const tags = normalizeTags(body && body.tags);
  const reviewFormUrl = `/reviews/new?orderId=${orderId}&itemId=${itemId}&productId=${productId}#review-form`;

  if (!Number.isFinite(diem) || diem < 1 || diem > 5) {
    return { ok: false, error: 'Vui lòng chọn số sao hợp lệ (1-5)', redirect: reviewFormUrl };
  }
  if (noidung.length < 10) {
    return { ok: false, error: 'Nội dung đánh giá tối thiểu 10 ký tự', redirect: reviewFormUrl };
  }

  const quyen = await kiemTraQuyenDanhGia({
    userId,
    orderId,
    itemId,
    productId
  });

  if (!quyen || !quyen.order || !quyen.item) {
    return { ok: false, error: 'Không thể đánh giá sản phẩm này', redirect: '/orders' };
  }

  const existed = await Danhgia.findOne({
    nguoidung_id: userId,
    chitietdonhang_id: quyen.item._id,
    daxoa: { $ne: true }
  }).lean();

  if (existed) {
    return { ok: false, error: 'Bạn đã đánh giá sản phẩm này', redirect: `/reviews/${existed._id}/edit` };
  }

  const uploaded = extractMediaFromRequestFiles(files);
  const sizeError = validateUploadedFileSizes(files);
  if (sizeError) {
    return { ok: false, error: sizeError, redirect: reviewFormUrl };
  }

  const imgs = uploaded.images.slice(0, MAX_REVIEW_IMAGES);
  const videos = uploaded.videos.slice(0, MAX_REVIEW_VIDEOS);

  if (uploaded.images.length > MAX_REVIEW_IMAGES) {
    return { ok: false, error: `Tối đa ${MAX_REVIEW_IMAGES} ảnh cho mỗi đánh giá`, redirect: reviewFormUrl };
  }
  if (uploaded.videos.length > MAX_REVIEW_VIDEOS) {
    return { ok: false, error: `Tối đa ${MAX_REVIEW_VIDEOS} video cho mỗi đánh giá`, redirect: reviewFormUrl };
  }

  await Danhgia.create({
    sanpham_id: quyen.item.sanpham_id,
    nguoidung_id: userId,
    donhang_id: quyen.order._id,
    chitietdonhang_id: quyen.item._id,
    diem,
    noidung,
    hinhanh: imgs,
    videos,
    tags,
    mausac: quyen.item.mausac,
    kichco: quyen.item.kichco,
    trangthai: 'approved',
    hienthi: true,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  await Chitietdonhang.updateOne({ _id: quyen.item._id }, { $set: { danhgia: true } });

  return { ok: true, success: 'Đã gửi đánh giá', redirect: `/orders/${quyen.order._id}` };
}

async function getEditPageData({ reviewId, userId }) {
  const id = String(reviewId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, error: 'Đánh giá không hợp lệ', redirect: '/orders' };
  }

  const review = await Danhgia.findOne({ _id: id, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!review) {
    return { ok: false, error: 'Không tìm thấy đánh giá', redirect: '/orders' };
  }

  const canEdit = isEditableWithinWindow(review);
  const order = await Donhang.findById(review.donhang_id).lean();
  const item = await Chitietdonhang.findById(review.chitietdonhang_id).lean();
  const media = normalizeReviewMedia(review);

  return {
    ok: true,
    viewData: {
      titlePage: 'Sửa đánh giá',
      order,
      item,
      productId: review.sanpham_id,
      review,
      reviewImages: media.images,
      reviewVideos: media.videos,
      tags: TAGS_NHANH,
      canEdit,
      editWindowDays: EDIT_WINDOW_DAYS
    }
  };
}

async function updateReview({ reviewId, userId, body, files }) {
  const id = String(reviewId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, error: 'Đánh giá không hợp lệ', redirect: '/orders' };
  }

  const review = await Danhgia.findOne({ _id: id, nguoidung_id: userId, daxoa: { $ne: true } });
  if (!review) {
    return { ok: false, error: 'Không tìm thấy đánh giá', redirect: '/orders' };
  }

  if (!isEditableWithinWindow(review)) {
    return { ok: false, error: 'Đã quá hạn sửa đánh giá', redirect: `/reviews/${id}/edit` };
  }

  const diem = Number(body && body.diem ? body.diem : 0);
  const noidung = String(body && body.noidung ? body.noidung : '').trim();
  const tags = normalizeTags(body && body.tags);

  if (!Number.isFinite(diem) || diem < 1 || diem > 5) {
    return { ok: false, error: 'Vui lòng chọn số sao hợp lệ (1-5)', redirect: 'back' };
  }
  if (noidung.length < 10) {
    return { ok: false, error: 'Nội dung đánh giá tối thiểu 10 ký tự', redirect: 'back' };
  }

  const uploaded = extractMediaFromRequestFiles(files);
  const sizeError = validateUploadedFileSizes(files);
  if (sizeError) {
    return { ok: false, error: sizeError, redirect: 'back' };
  }

  const removeImages = parseRemoveList(body && body.removeImages);
  const removeVideos = parseRemoveList(body && body.removeVideos);

  const media = normalizeReviewMedia(review);
  const keptImages = media.images.filter((url) => !removeImages.includes(url));
  const keptVideos = media.videos.filter((url) => !removeVideos.includes(url));

  const mergedImages = keptImages.concat(uploaded.images);
  const mergedVideos = keptVideos.concat(uploaded.videos);

  if (mergedImages.length > MAX_REVIEW_IMAGES) {
    return { ok: false, error: `Tối đa ${MAX_REVIEW_IMAGES} ảnh cho mỗi đánh giá`, redirect: 'back' };
  }
  if (mergedVideos.length > MAX_REVIEW_VIDEOS) {
    return { ok: false, error: `Tối đa ${MAX_REVIEW_VIDEOS} video cho mỗi đánh giá`, redirect: 'back' };
  }

  review.diem = diem;
  review.noidung = noidung;
  review.tags = tags;
  review.hinhanh = mergedImages;
  review.videos = mergedVideos;
  review.ngaycapnhat = new Date();

  await review.save();

  return { ok: true, success: 'Đã cập nhật đánh giá', redirect: `/orders/${review.donhang_id}` };
}

async function deleteReview({ reviewId, userId }) {
  const id = String(reviewId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, error: 'Đánh giá không hợp lệ', redirect: '/orders' };
  }

  const review = await Danhgia.findOne({ _id: id, nguoidung_id: userId, daxoa: { $ne: true } });
  if (!review) {
    return { ok: false, error: 'Không tìm thấy đánh giá', redirect: '/orders' };
  }

  review.daxoa = true;
  review.ngaycapnhat = new Date();
  await review.save();

  return { ok: true, success: 'Đã xóa đánh giá', redirect: `/orders/${review.donhang_id}` };
}

async function getReviewsByProduct({ productId, rating, mediaQuery, hasImageLegacy, sort }) {
  const id = String(productId || '').trim();
  const diem = Number(rating || 0);
  const media = String(mediaQuery || '').trim().toLowerCase() || (String(hasImageLegacy || '') === '1' ? 'image' : 'all');
  const sortValue = String(sort || 'newest');

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, status: 400, message: 'Sản phẩm không hợp lệ' };
  }

  const baseFilter = { sanpham_id: id, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } };
  if (diem >= 1 && diem <= 5) baseFilter.diem = diem;

  let sortObj = { ngaytao: -1 };
  if (sortValue === 'oldest') sortObj = { ngaytao: 1 };

  const reviewsRaw = await Danhgia.find(baseFilter)
    .populate({ path: 'nguoidung_id', select: 'hoten avatar' })
    .sort(sortObj)
    .lean();

  const reviews = (reviewsRaw || [])
    .map((r) => {
      const normalized = normalizeReviewMedia(r);
      return {
        ...r,
        hinhanh: normalized.images,
        videos: normalized.videos,
        user: {
          ten: r && r.nguoidung_id && r.nguoidung_id.hoten ? String(r.nguoidung_id.hoten) : 'Khách hàng',
          avatar: r && r.nguoidung_id && r.nguoidung_id.avatar ? String(r.nguoidung_id.avatar) : '/images/avatar/avatar.png'
        }
      };
    })
    .filter((r) => {
      const hasImage = Array.isArray(r.hinhanh) && r.hinhanh.length > 0;
      const hasVideo = Array.isArray(r.videos) && r.videos.length > 0;
      if (media === 'image') return hasImage;
      if (media === 'video') return hasVideo;
      if (media === 'both') return hasImage && hasVideo;
      return true;
    });

  return { ok: true, data: reviews };
}

module.exports = {
  getCreatePageData,
  createReview,
  getEditPageData,
  updateReview,
  deleteReview,
  getReviewsByProduct
};
