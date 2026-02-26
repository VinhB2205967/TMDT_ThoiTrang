const Lookbook = require('../../../models/lookbook_model');
const Sanpham = require('../../../models/product_model');
const productHelper = require('../../../helpers/product');
const mongoose = require('mongoose');

function buildActiveLookbookFilter(now = new Date()) {
  return {
    deletedAt: null,
    $or: [
      { isActive: true },
      { hienthi: true }
    ],
    $and: [
      {
        $or: [
          { startDate: null },
          { startDate: { $exists: false } },
          { startDate: { $lte: now } }
        ]
      },
      {
        $or: [
          { endDate: null },
          { endDate: { $exists: false } },
          { endDate: { $gte: now } }
        ]
      }
    ]
  };
}

module.exports.danhSach = async (req, res) => {
  const now = new Date();
  const lookbooks = await Lookbook.find(buildActiveLookbookFilter(now))
    .sort({ order: 1, thuTu: 1, createdAt: -1 })
    .lean();

  const normalized = lookbooks.map((book) => ({
    ...book,
    title: book.title || book.tenmua || '',
    image: book.image || book.hinhanh || '',
    description: book.description || book.mota || '',
    products: Array.isArray(book.products) && book.products.length ? book.products : (book.sanpham_ids || [])
  }));

  res.render('client/pages/lookbook/index.pug', {
    titlePage: 'Lookbook',
    lookbooks: normalized
  });
};

module.exports.chiTiet = async (req, res) => {
  const now = new Date();
  const slugOrId = String(req.params.slug || '').trim();
  const slugOrIdFilter = mongoose.Types.ObjectId.isValid(slugOrId)
    ? { $or: [{ slug: slugOrId }, { _id: slugOrId }] }
    : { slug: slugOrId };

  const lookbook = await Lookbook.findOne({
    ...slugOrIdFilter,
    ...buildActiveLookbookFilter(now)
  }).lean();

  if (!lookbook) {
    return res.status(404).render('client/pages/errors/404.pug', {
      titlePage: '404 - Khong tim thay'
    });
  }

  const ids = Array.isArray(lookbook.products) && lookbook.products.length
    ? lookbook.products
    : (Array.isArray(lookbook.sanpham_ids) ? lookbook.sanpham_ids : []);
  const rawProducts = ids.length
    ? await Sanpham.find({
      _id: { $in: ids },
      trangthai: 'dangban',
      daxoa: { $ne: true }
    }).lean()
    : [];

  const productMap = new Map(rawProducts.map((p) => [String(p._id), p]));
  const ordered = ids.map((id) => productMap.get(String(id))).filter(Boolean).map(productHelper);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 12;
  const totalProducts = ordered.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const paginatedProducts = ordered.slice(start, start + limit);

  res.render('client/pages/lookbook/detail.pug', {
    titlePage: lookbook.title || lookbook.tenmua,
    lookbook: {
      ...lookbook,
      title: lookbook.title || lookbook.tenmua || '',
      image: lookbook.image || lookbook.hinhanh || '',
      description: lookbook.description || lookbook.mota || ''
    },
    products: paginatedProducts,
    pagination: {
      currentPage,
      totalPages,
      totalProducts,
      limit
    }
  });
};
