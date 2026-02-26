const mongoose = require('mongoose');
const Brand = require('../../../models/brand_model');
const Sanpham = require('../../../models/product_model');
const productHelper = require('../../../helpers/product');

const PAGE_SIZE = 12;

function queryBrandActive() {
  return {
    daXoa: { $ne: true },
    $or: [{ hienthi: true }, { isActive: true }]
  };
}

module.exports.danhSach = async (req, res) => {
  const brands = await Brand.find(queryBrandActive())
    .sort({ order: 1, thuTu: 1, ten: 1 })
    .lean();

  res.render('client/pages/brands/index.pug', {
    titlePage: 'Thương hiệu',
    brands
  });
};

module.exports.chiTiet = async (req, res) => {
  const slugOrId = String(req.params.slug || '').trim();
  const page = Math.max(1, Number(req.query.page || 1));

  const query = {
    ...queryBrandActive(),
    ...(mongoose.Types.ObjectId.isValid(slugOrId)
      ? { $or: [{ slug: slugOrId }, { _id: slugOrId }] }
      : { slug: slugOrId })
  };

  const brand = await Brand.findOne(query).lean();
  if (!brand) {
    return res.status(404).render('client/pages/errors/404.pug', {
      titlePage: '404 - Không tìm thấy thương hiệu'
    });
  }

  const productQuery = {
    daxoa: { $ne: true },
    trangthai: 'dangban',
    $or: [{ brand: brand._id }, { thuonghieu_id: brand._id }]
  };

  const total = await Sanpham.countDocuments(productQuery);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const products = await Sanpham.find(productQuery)
    .sort({ ngaytao: -1 })
    .skip((safePage - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  res.render('client/pages/brands/detail.pug', {
    titlePage: brand.ten,
    brand,
    products: (products || []).map(productHelper),
    pagination: {
      currentPage: safePage,
      totalPages,
      totalItems: total,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages
    }
  });
};
