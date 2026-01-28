const YeuThich = require('../models/favorite_model');

async function ganSoLuongYeuThich(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      res.locals.favoriteCount = 0;
      return next();
    }

    const soLuong = await YeuThich.countDocuments({ nguoidung_id: req.user._id });
    res.locals.favoriteCount = Number.isFinite(soLuong) ? soLuong : 0;
    return next();
  } catch {
    res.locals.favoriteCount = 0;
    return next();
  }
}

module.exports = {
  // Giữ tương thích tên cũ
  attachFavoriteCount: ganSoLuongYeuThich,
  // Alias tiếng Việt
  ganSoLuongYeuThich
};
