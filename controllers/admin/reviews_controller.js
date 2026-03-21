const reviewsAdminService = require('../../services/content/admin-reviews.service.js');

module.exports.danhSach = async (req, res) => {
  try {
    const data = await reviewsAdminService.getDanhSachData(req.query || {});
    return res.render('admin/pages/reviews/index.pug', data);
  } catch (err) {
    console.error('admin reviews index error:', err);
    req.flash('error', 'Không thể tải danh sách đánh giá');
    return res.render('admin/pages/reviews/index.pug', reviewsAdminService.getDanhSachFallbackData());
  }
};

module.exports.chiTiet = async (req, res) => {
  try {
    const result = await reviewsAdminService.getChiTietData(req.params.id);
    if (!result.ok) {
      req.flash('error', result.message || 'Không tìm thấy đánh giá');
      return res.redirect(result.redirect || reviewsAdminService.layDuongDanDanhSachMacDinh());
    }

    return res.render('admin/pages/reviews/detail.pug', result.data);
  } catch (err) {
    console.error('admin review detail error:', err);
    req.flash('error', 'Không thể tải chi tiết đánh giá');
    return res.redirect(reviewsAdminService.layDuongDanDanhSachMacDinh());
  }
};

module.exports.capNhatHienThi = async (req, res) => {
  try {
    const result = await reviewsAdminService.capNhatHienThi({
      id: req.params.id,
      action: req.body.action,
      reason: req.body.reason,
      actorId: req.user?._id || null
    });

    req.flash(reviewsAdminService.xacDinhLoaiFlashKetQua(result), result.message);
    return res.redirect(result.redirect || reviewsAdminService.layDuongDanDanhSachMacDinh());
  } catch (err) {
    console.error('admin review visibility error:', err);
    req.flash('error', 'Không thể cập nhật trạng thái đánh giá');
    return res.redirect(reviewsAdminService.layDuongDanDanhSachMacDinh());
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await reviewsAdminService.xoaDanhGia({
      id: req.params.id,
      actorId: req.user?._id || null
    });

    req.flash(reviewsAdminService.xacDinhLoaiFlashKetQua(result), result.message);
    return res.redirect(result.redirect || reviewsAdminService.layDuongDanDanhSachMacDinh());
  } catch (err) {
    console.error('admin review delete error:', err);
    req.flash('error', 'Không thể xóa đánh giá');
    return res.redirect(reviewsAdminService.layDuongDanDanhSachMacDinh());
  }
};

