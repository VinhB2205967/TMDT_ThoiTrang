const reviewsService = require('../../services/review/client-reviews.service');

module.exports.taoMoi = async (req, res) => {
  try {
    const orderId = String(req.query.orderId || '').trim();
    const itemId = String(req.query.itemId || '').trim();
    const productId = String(req.query.productId || '').trim();

    const result = await reviewsService.getCreatePageData({
      userId: req.user._id,
      orderId,
      itemId,
      productId
    });

    if (!result.ok) {
      req.flash?.('error', result.error);
      return res.redirect(result.redirect || '/orders');
    }

    return res.render('client/pages/reviews/create.pug', result.viewData);
  } catch (err) {
    console.error('review create page error:', err);
    req.flash?.('error', 'Không thể mở trang đánh giá. Vui lòng thử lại.');
    return res.redirect('/orders');
  }
};

module.exports.taoMoiPost = async (req, res) => {
  try {
    const result = await reviewsService.createReview({
      userId: req.user._id,
      body: req.body,
      files: req.files
    });

    if (!result.ok) {
      req.flash?.('error', result.error);
      return res.redirect(result.redirect || '/orders');
    }

    req.flash?.('success', result.success);
    return res.redirect(result.redirect || '/orders');
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
  try {
    const result = await reviewsService.getEditPageData({
      reviewId: req.params.id,
      userId: req.user._id
    });

    if (!result.ok) {
      req.flash?.('error', result.error);
      return res.redirect(result.redirect || '/orders');
    }

    return res.render('client/pages/reviews/create.pug', result.viewData);
  } catch (err) {
    console.error('review edit page error:', err);
    req.flash?.('error', 'Không thể mở trang sửa đánh giá');
    return res.redirect('/orders');
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await reviewsService.updateReview({
      reviewId: req.params.id,
      userId: req.user._id,
      body: req.body,
      files: req.files
    });

    if (!result.ok) {
      req.flash?.('error', result.error);
      return res.redirect(result.redirect || 'back');
    }

    req.flash?.('success', result.success);
    return res.redirect(result.redirect || '/orders');
  } catch (err) {
    console.error('update review error:', err);
    req.flash?.('error', 'Không thể cập nhật đánh giá');
    return res.redirect('back');
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await reviewsService.deleteReview({
      reviewId: req.params.id,
      userId: req.user._id
    });

    if (!result.ok) {
      req.flash?.('error', result.error);
      return res.redirect(result.redirect || '/orders');
    }

    req.flash?.('success', result.success);
    return res.redirect(result.redirect || '/orders');
  } catch (err) {
    console.error('delete review error:', err);
    req.flash?.('error', 'Không thể xóa đánh giá');
    return res.redirect('back');
  }
};
