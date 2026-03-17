const mongoose = require('mongoose');
const Danhgia = require('../../models/review_model');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');

const TAGS_NHANH = ['Đẹp', 'Đúng mô tả', 'Giao nhanh', 'Vải ok', 'Sai size'];
const EDIT_WINDOW_DAYS = 7;
const MAX_REVIEW_IMAGES = 5;
const MAX_REVIEW_VIDEOS = 1;
const MAX_IMAGE_SIZE_MB = 20;
const MAX_VIDEO_SIZE_MB = 100;

function isVideoUrl(url) {
  return /\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(String(url || ''));
}

function splitMediaUrls(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const images = [];
  const videos = [];
  list.forEach((url) => {
    const val = String(url || '').trim();
    if (!val) return;
    if (isVideoUrl(val)) videos.push(val);
    else images.push(val);
  });
  return { images, videos };
}

function extractMediaFromRequestFiles(req) {
  const files = req && req.files ? req.files : null;
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

function collectUploadedFiles(req) {
  const files = req && req.files ? req.files : null;
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return []
    .concat(Array.isArray(files.images) ? files.images : [])
    .concat(Array.isArray(files.videos) ? files.videos : [])
    .concat(Array.isArray(files.hinhanh) ? files.hinhanh : []);
}

function validateUploadedFileSizes(req) {
  const allFiles = collectUploadedFiles(req);
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
  const videos = old.videos.concat(Array.isArray(review && review.videos) ? review.videos : []);
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

module.exports.taoMoi = async (req, res) => {
  try {
    const orderId = String(req.query.orderId || '').trim();
    const itemId = String(req.query.itemId || '').trim();
    const productId = String(req.query.productId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      req.flash?.('error', 'Sản phẩm không hợp lệ');
      return res.redirect('/orders');
    }

    const quyen = await kiemTraQuyenDanhGia({
      userId: req.user._id,
      orderId,
      itemId,
      productId
    });

    if (!quyen || !quyen.order) {
      req.flash?.('error', 'Không thể đánh giá đơn hàng này');
      return res.redirect('/orders');
    }

    if (!quyen.item) {
      req.flash?.('error', 'Không tìm thấy sản phẩm trong đơn');
      return res.redirect(`/orders/${orderId}`);
    }

    const existing = await Danhgia.findOne({
      nguoidung_id: req.user._id,
      chitietdonhang_id: quyen.item._id,
      daxoa: { $ne: true }
    }).lean();

    if (existing) {
      const canEdit = isEditableWithinWindow(existing);
      const media = normalizeReviewMedia(existing);
      return res.render('client/pages/reviews/create.pug', {
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
      });
    }

    return res.render('client/pages/reviews/create.pug', {
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
    });
  } catch (err) {
    console.error('review create page error:', err);
    req.flash?.('error', 'Không thể mở trang đánh giá. Vui lòng thử lại.');
    return res.redirect('/orders');
  }
};

module.exports.taoMoiPost = async (req, res) => {
  try {
    const orderId = String(req.body.orderId || '').trim();
    const itemId = String(req.body.itemId || '').trim();
    const productId = String(req.body.productId || '').trim();

    const diem = Number(req.body.diem || 0);
    const noidung = String(req.body.noidung || '').trim();
    const tags = Array.isArray(req.body.tags) ? req.body.tags.map(t => String(t)) : (req.body.tags ? [String(req.body.tags)] : []);
    const reviewFormUrl = `/reviews/new?orderId=${orderId}&itemId=${itemId}&productId=${productId}#review-form`;

    if (!Number.isFinite(diem) || diem < 1 || diem > 5) {
      req.flash?.('error', 'Vui lòng chọn số sao hợp lệ (1-5)');
      return res.redirect(reviewFormUrl);
    }
    if (noidung.length < 10) {
      req.flash?.('error', 'Nội dung đánh giá tối thiểu 10 ký tự');
      return res.redirect(reviewFormUrl);
    }

    const quyen = await kiemTraQuyenDanhGia({
      userId: req.user._id,
      orderId,
      itemId,
      productId
    });

    if (!quyen || !quyen.order || !quyen.item) {
      req.flash?.('error', 'Không thể đánh giá sản phẩm này');
      return res.redirect('/orders');
    }

    const existed = await Danhgia.findOne({
      nguoidung_id: req.user._id,
      chitietdonhang_id: quyen.item._id,
      daxoa: { $ne: true }
    }).lean();

    if (existed) {
      req.flash?.('error', 'Bạn đã đánh giá sản phẩm này');
      return res.redirect(`/reviews/${existed._id}/edit`);
    }

    const uploaded = extractMediaFromRequestFiles(req);
    const sizeError = validateUploadedFileSizes(req);
    if (sizeError) {
      req.flash?.('error', sizeError);
      return res.redirect(reviewFormUrl);
    }
    const imgs = uploaded.images.slice(0, MAX_REVIEW_IMAGES);
    const videos = uploaded.videos.slice(0, MAX_REVIEW_VIDEOS);

    if (uploaded.images.length > MAX_REVIEW_IMAGES) {
      req.flash?.('error', `Tối đa ${MAX_REVIEW_IMAGES} ảnh cho mỗi đánh giá`);
      return res.redirect(reviewFormUrl);
    }
    if (uploaded.videos.length > MAX_REVIEW_VIDEOS) {
      req.flash?.('error', `Tối đa ${MAX_REVIEW_VIDEOS} video cho mỗi đánh giá`);
      return res.redirect(reviewFormUrl);
    }

    await Danhgia.create({
      sanpham_id: quyen.item.sanpham_id,
      nguoidung_id: req.user._id,
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

    req.flash?.('success', 'Đã gửi đánh giá');
    return res.redirect(`/orders/${quyen.order._id}`);
  } catch (err) {
    console.error('create review error:', err);
    req.flash?.('error', 'Không thể gửi đánh giá');
    const orderId = String(req.body.orderId || '').trim();
    const itemId = String(req.body.itemId || '').trim();
    const productId = String(req.body.productId || '').trim();
    if (orderId && productId) {
      return res.redirect(`/reviews/new?orderId=${orderId}&itemId=${itemId}&productId=${productId}#review-form`);
    }
    return res.redirect('/orders');
  }
};

module.exports.sua = async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    req.flash?.('error', 'Đánh giá không hợp lệ');
    return res.redirect('/orders');
  }

  const review = await Danhgia.findOne({ _id: id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
  if (!review) {
    req.flash?.('error', 'Không tìm thấy đánh giá');
    return res.redirect('/orders');
  }

  const canEdit = isEditableWithinWindow(review);
  const order = await Donhang.findById(review.donhang_id).lean();
  const item = await Chitietdonhang.findById(review.chitietdonhang_id).lean();
  const media = normalizeReviewMedia(review);

  return res.render('client/pages/reviews/create.pug', {
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
  });
};

module.exports.capNhat = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash?.('error', 'Đánh giá không hợp lệ');
      return res.redirect('/orders');
    }

    const review = await Danhgia.findOne({ _id: id, nguoidung_id: req.user._id, daxoa: { $ne: true } });
    if (!review) {
      req.flash?.('error', 'Không tìm thấy đánh giá');
      return res.redirect('/orders');
    }

    if (!isEditableWithinWindow(review)) {
      req.flash?.('error', 'Đã quá hạn sửa đánh giá');
      return res.redirect(`/reviews/${id}/edit`);
    }

    const diem = Number(req.body.diem || 0);
    const noidung = String(req.body.noidung || '').trim();
    const tags = Array.isArray(req.body.tags) ? req.body.tags.map(t => String(t)) : (req.body.tags ? [String(req.body.tags)] : []);

    if (!Number.isFinite(diem) || diem < 1 || diem > 5) {
      req.flash?.('error', 'Vui lòng chọn số sao hợp lệ (1-5)');
      return res.redirect('back');
    }
    if (noidung.length < 10) {
      req.flash?.('error', 'Nội dung đánh giá tối thiểu 10 ký tự');
      return res.redirect('back');
    }

    const uploaded = extractMediaFromRequestFiles(req);
    const sizeError = validateUploadedFileSizes(req);
    if (sizeError) {
      req.flash?.('error', sizeError);
      return res.redirect('back');
    }
    const removeImages = parseRemoveList(req.body.removeImages);
    const removeVideos = parseRemoveList(req.body.removeVideos);

    const media = normalizeReviewMedia(review);
    const keptImages = media.images.filter((url) => !removeImages.includes(url));
    const keptVideos = media.videos.filter((url) => !removeVideos.includes(url));

    const mergedImages = keptImages.concat(uploaded.images);
    const mergedVideos = keptVideos.concat(uploaded.videos);

    if (mergedImages.length > MAX_REVIEW_IMAGES) {
      req.flash?.('error', `Tối đa ${MAX_REVIEW_IMAGES} ảnh cho mỗi đánh giá`);
      return res.redirect('back');
    }
    if (mergedVideos.length > MAX_REVIEW_VIDEOS) {
      req.flash?.('error', `Tối đa ${MAX_REVIEW_VIDEOS} video cho mỗi đánh giá`);
      return res.redirect('back');
    }

    review.diem = diem;
    review.noidung = noidung;
    review.tags = tags;
    review.hinhanh = mergedImages;
    review.videos = mergedVideos;
    review.ngaycapnhat = new Date();

    await review.save();
    req.flash?.('success', 'Đã cập nhật đánh giá');
    return res.redirect(`/orders/${review.donhang_id}`);
  } catch (err) {
    console.error('update review error:', err);
    req.flash?.('error', 'Không thể cập nhật đánh giá');
    return res.redirect('back');
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash?.('error', 'Đánh giá không hợp lệ');
      return res.redirect('/orders');
    }

    const review = await Danhgia.findOne({ _id: id, nguoidung_id: req.user._id, daxoa: { $ne: true } });
    if (!review) {
      req.flash?.('error', 'Không tìm thấy đánh giá');
      return res.redirect('/orders');
    }

    review.daxoa = true;
    review.ngaycapnhat = new Date();
    await review.save();

    req.flash?.('success', 'Đã xóa đánh giá');
    return res.redirect(`/orders/${review.donhang_id}`);
  } catch (err) {
    console.error('delete review error:', err);
    req.flash?.('error', 'Không thể xóa đánh giá');
    return res.redirect('back');
  }
};

module.exports.layDanhSachTheoSanPham = async (req, res) => {
  try {
    const productId = String(req.params.id || '').trim();
    const rating = Number(req.query.rating || 0);
    const mediaQuery = String(req.query.media || '').trim().toLowerCase();
    const hasImageLegacy = String(req.query.hasImage || '') === '1';
    const media = mediaQuery || (hasImageLegacy ? 'image' : 'all');
    const sort = String(req.query.sort || 'newest');

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Sản phẩm không hợp lệ' });
    }

    const baseFilter = { sanpham_id: productId, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } };
    if (rating >= 1 && rating <= 5) baseFilter.diem = rating;

    let sortObj = { ngaytao: -1 };
    if (sort === 'oldest') sortObj = { ngaytao: 1 };

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

    return res.json({ success: true, data: reviews });
  } catch (err) {
    console.error('get reviews error:', err);
    return res.status(500).json({ success: false, message: 'Không thể tải đánh giá' });
  }
};
