const sanpham = require("../../models/product_model");
const productHelper = require("../../helpers/product");
const yeuthich = require("../../models/favorite_model");
const { buildProductStats, applyProductStats } = require('../../helpers/productStats');

// Danh sách
module.exports.danhSach = async (req, res) => {
  const danhsachyeuthich = await yeuthich.find({ nguoidung_id: req.user._id })
    .sort({ ngaythem: -1 })
    .select('sanpham_id')
    .lean();

  const danhsachidyeuthich = (danhsachyeuthich || []).map(f => String(f.sanpham_id));

  let danhsachsanpham = [];
  if (danhsachidyeuthich.length) {
    const danhsachtimthay = await sanpham.find({
      _id: { $in: danhsachidyeuthich },
      daxoa: { $ne: true },
      trangthai: 'dangban'
    }).lean();

    const ids = (danhsachtimthay || []).map(p => p && p._id).filter(Boolean);
    const { ratingMap, soldMap } = await buildProductStats(ids);
    const maptheoid = new Map((danhsachtimthay || []).map(p => [
      String(p._id),
      applyProductStats([productHelper(p)], ratingMap, soldMap)[0]
    ]));
    danhsachsanpham = danhsachidyeuthich.map(id => maptheoid.get(id)).filter(Boolean);
  }

  res.render('client/pages/favorites/index', {
    titlePage: 'Sản phẩm yêu thích',
    products: danhsachsanpham
  });
};
