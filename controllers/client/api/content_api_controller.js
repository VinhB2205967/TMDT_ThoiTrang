const Banner = require('../../../models/banner_model');
const Brand = require('../../../models/brand_model');
const Lookbook = require('../../../models/lookbook_model');
const BlogPost = require('../../../models/blog_model');
const { getFlashSaleActive } = require('../../../services/catalog/flashSale.service.js');

module.exports.getBanners = async (req, res) => {
  const { type, active } = req.query;
  const filter = {};
  if (active === 'true') filter.hienthi = true;
  if (type) filter.loai = type;
  const data = await Banner.find(filter).sort({ thuTu: 1 }).lean();
  res.json({ success: true, data });
};

module.exports.getFlashSale = async (req, res) => {
  const data = await getFlashSaleActive();
  res.json({ success: true, data });
};

module.exports.getLookbooks = async (req, res) => {
  const data = await Lookbook.find({ hienthi: true }).sort({ thuTu: 1 }).lean();
  res.json({ success: true, data });
};

module.exports.getLookbookDetail = async (req, res) => {
  const data = await Lookbook.findById(req.params.id).lean();
  if (!data || data.hienthi === false) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  res.json({ success: true, data });
};

module.exports.getFeaturedBrands = async (req, res) => {
  const data = await Brand.find({
    daXoa: { $ne: true },
    $and: [
      { $or: [{ hienthi: true }, { isActive: true }] },
      { $or: [{ noiBat: true }, { isFeatured: true }] }
    ]
  }).sort({ order: 1, thuTu: 1, ten: 1 }).lean();
  res.json({ success: true, data });
};

module.exports.getBlogs = async (req, res) => {
  const limit = Math.max(1, Number(req.query.limit) || 6);
  const data = await BlogPost.find({ xuatban: true }).sort({ ngayxuatban: -1, ngaytao: -1 }).limit(limit).lean();
  res.json({ success: true, data });
};
