const YeuThich = require('../models/favorite_model');

async function attachFavoriteCount(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      res.locals.favoriteCount = 0;
      return next();
    }

    const count = await YeuThich.countDocuments({ nguoidung_id: req.user._id });
    res.locals.favoriteCount = Number.isFinite(count) ? count : 0;
    return next();
  } catch {
    res.locals.favoriteCount = 0;
    return next();
  }
}

module.exports = {
  attachFavoriteCount
};
