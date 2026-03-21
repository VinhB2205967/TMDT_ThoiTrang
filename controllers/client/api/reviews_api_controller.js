const reviewsService = require('../../../services/review/client-reviews.service');

module.exports.layDanhSachTheoSanPham = async (req, res) => {
  try {
    const result = await reviewsService.getReviewsByProduct({
      productId: req.params.id,
      rating: req.query.rating,
      mediaQuery: req.query.media,
      hasImageLegacy: req.query.hasImage,
      sort: req.query.sort
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message || 'Dữ liệu không hợp lệ' });
    }

    return res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('get reviews error:', err);
    return res.status(500).json({ success: false, message: 'Không thể tải đánh giá' });
  }
};
