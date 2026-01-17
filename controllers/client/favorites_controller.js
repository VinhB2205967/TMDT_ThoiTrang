const Sanpham = require("../../models/product_model");
const productHelper = require("../../helpers/product");
const Yeuthich = require("../../models/favorite_model");

function wantsJSON(req) {
  const accept = String(req.headers.accept || '');
  return req.xhr || accept.includes('application/json') || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
}

// [GET] /favorites
module.exports.index = async (req, res) => {
  try {
    const favs = await Yeuthich.find({ nguoidung_id: req.user._id })
      .sort({ ngaythem: -1 })
      .select('sanpham_id')
      .lean();

    const favoriteIds = (favs || []).map(f => String(f.sanpham_id));

    let products = [];
    if (favoriteIds.length) {
      const found = await Sanpham.find({
        _id: { $in: favoriteIds },
        daxoa: { $ne: true },
        trangthai: 'dangban'
      }).lean();

      const byId = new Map((found || []).map(p => [String(p._id), productHelper(p)]));
      products = favoriteIds.map(id => byId.get(id)).filter(Boolean);
    }

    res.render('client/pages/favorites/index', {
      titlePage: 'Sản phẩm yêu thích',
      products
    });
  } catch (error) {
    console.error("Favorites error:", error);
    res.render('client/pages/favorites/index', {
      titlePage: 'Sản phẩm yêu thích',
      products: []
    });
  }
};

// [GET] /favorites/ids
module.exports.ids = async (req, res) => {
  try {
    const favs = await Yeuthich.find({ nguoidung_id: req.user._id })
      .select('sanpham_id')
      .lean();
    const ids = (favs || []).map(f => String(f.sanpham_id));
    return res.json({ success: true, ids });
  } catch {
    return res.json({ success: true, ids: [] });
  }
};

// [POST] /favorites/add/:id
module.exports.add = async (req, res) => {
  try {
    const productId = req.params.id;
    await Yeuthich.updateOne(
      { nguoidung_id: req.user._id, sanpham_id: productId },
      { $setOnInsert: { nguoidung_id: req.user._id, sanpham_id: productId, ngaythem: new Date() } },
      { upsert: true }
    );
    return res.json({ success: true, active: true, message: 'Đã thêm vào yêu thích' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

// [POST] /favorites/remove/:id
module.exports.remove = async (req, res) => {
  try {
    const productId = req.params.id;
    await Yeuthich.deleteOne({ nguoidung_id: req.user._id, sanpham_id: productId });
    return res.json({ success: true, active: false, message: 'Đã xóa khỏi yêu thích' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

// [POST] /favorites/toggle/:id
module.exports.toggle = async (req, res) => {
  try {
    const productId = req.params.id;

    const existing = await Yeuthich.findOne({ nguoidung_id: req.user._id, sanpham_id: productId }).select('_id').lean();
    if (existing) {
      await Yeuthich.deleteOne({ _id: existing._id });
      return res.json({ success: true, active: false });
    }

    await Yeuthich.create({ nguoidung_id: req.user._id, sanpham_id: productId });
    return res.json({ success: true, active: true });
  } catch (error) {
    if (wantsJSON(req)) return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
    return res.redirect('/favorites');
  }
};
