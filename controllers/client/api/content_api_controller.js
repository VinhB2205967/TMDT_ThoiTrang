const mongoose = require('mongoose');
const Banner = require('../../../models/banner_model');
const Brand = require('../../../models/brand_model');
const Lookbook = require('../../../models/lookbook_model');
const BlogPost = require('../../../models/blog_model');
const Sanpham = require('../../../models/product_model');
const productHelper = require('../../../helpers/product');
const { getFlashSaleActive } = require('../../../services/flashSale.service');

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function parsePagination(query, fallbackLimit = DEFAULT_LIMIT) {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(MAX_LIMIT, toPositiveInt(query.limit, fallbackLimit));
  return { page, limit };
}

function slugOrIdFilter(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (mongoose.Types.ObjectId.isValid(v)) {
    return { $or: [{ slug: v }, { _id: v }] };
  }
  return { slug: v };
}

function queryBrandActive() {
  return {
    daXoa: { $ne: true },
    $or: [{ hienthi: true }, { isActive: true }]
  };
}

function buildActiveLookbookFilter(now = new Date()) {
  return {
    deletedAt: null,
    $or: [{ isActive: true }, { hienthi: true }],
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

function normalizeLookbook(book) {
  return {
    ...book,
    id: String(book._id),
    title: book.title || book.tenmua || '',
    image: book.image || book.hinhanh || '',
    description: book.description || book.mota || '',
    products:
      Array.isArray(book.products) && book.products.length
        ? book.products
        : (book.sanpham_ids || [])
  };
}

function normalizeBrand(brand) {
  return {
    ...brand,
    id: String(brand._id)
  };
}

module.exports.getBanners = async (req, res) => {
  try {
    const { type, active } = req.query;
    const filter = {};
    if (active === 'true') filter.hienthi = true;
    if (type) filter.loai = type;

    const data = await Banner.find(filter).sort({ thuTu: 1 }).lean();
    return res.json({ success: true, data });
  } catch (err) {
    console.error('contentApi.getBanners error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách banner' });
  }
};

module.exports.getFlashSale = async (req, res) => {
  try {
    const data = await getFlashSaleActive();
    return res.json({ success: true, data });
  } catch (err) {
    console.error('contentApi.getFlashSale error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy flash sale' });
  }
};

// Legacy endpoint: giữ format cũ (mảng)
module.exports.getLookbooks = async (req, res) => {
  try {
    const now = new Date();
    const data = await Lookbook.find(buildActiveLookbookFilter(now))
      .sort({ order: 1, thuTu: 1, createdAt: -1 })
      .lean();
    return res.json({ success: true, data: (data || []).map(normalizeLookbook) });
  } catch (err) {
    console.error('contentApi.getLookbooks error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách lookbook' });
  }
};

// Legacy endpoint: giữ format cũ
module.exports.getLookbookDetail = async (req, res) => {
  try {
    const now = new Date();
    const idFilter = slugOrIdFilter(req.params.id);
    if (!idFilter) return res.status(400).json({ success: false, message: 'ID/slug lookbook không hợp lệ' });

    const data = await Lookbook.findOne({
      ...idFilter,
      ...buildActiveLookbookFilter(now)
    }).lean();

    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: normalizeLookbook(data) });
  } catch (err) {
    console.error('contentApi.getLookbookDetail error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy chi tiết lookbook' });
  }
};

module.exports.getFeaturedBrands = async (req, res) => {
  try {
    const data = await Brand.find({
      ...queryBrandActive(),
      $and: [{ $or: [{ noiBat: true }, { isFeatured: true }] }]
    })
      .sort({ order: 1, thuTu: 1, ten: 1 })
      .lean();
    return res.json({ success: true, data: (data || []).map(normalizeBrand) });
  } catch (err) {
    console.error('contentApi.getFeaturedBrands error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách thương hiệu nổi bật' });
  }
};

// Legacy endpoint: giữ format cũ (mảng bài mới nhất)
module.exports.getBlogs = async (req, res) => {
  try {
    const limit = Math.max(1, Number(req.query.limit) || 6);
    const data = await BlogPost.find({ xuatban: true })
      .sort({ ngayxuatban: -1, ngaytao: -1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, data });
  } catch (err) {
    console.error('contentApi.getBlogs error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách blog' });
  }
};

// New REST APIs based on content controllers logic
module.exports.listBrands = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, 20);
    const skip = (page - 1) * limit;
    const featured = String(req.query.featured || '').trim();

    const filter = { ...queryBrandActive() };
    if (featured === 'true') {
      filter.$and = [{ $or: [{ noiBat: true }, { isFeatured: true }] }];
    }

    const [rows, total] = await Promise.all([
      Brand.find(filter).sort({ order: 1, thuTu: 1, ten: 1 }).skip(skip).limit(limit).lean(),
      Brand.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: {
        items: (rows || []).map(normalizeBrand),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (err) {
    console.error('contentApi.listBrands error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách thương hiệu' });
  }
};

module.exports.getBrandDetail = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, DEFAULT_LIMIT);
    const slugFilter = slugOrIdFilter(req.params.slug);
    if (!slugFilter) return res.status(400).json({ success: false, message: 'Slug/id thương hiệu không hợp lệ' });

    const brand = await Brand.findOne({
      ...queryBrandActive(),
      ...slugFilter
    }).lean();

    if (!brand) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thương hiệu' });
    }

    const productQuery = {
      daxoa: { $ne: true },
      trangthai: 'dangban',
      $or: [{ brand: brand._id }, { thuonghieu_id: brand._id }]
    };

    const total = await Sanpham.countDocuments(productQuery);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);

    const products = await Sanpham.find(productQuery)
      .sort({ ngaytao: -1 })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: {
        brand: normalizeBrand(brand),
        products: (products || []).map(productHelper),
        pagination: {
          page: safePage,
          limit,
          total,
          totalPages,
          hasPrev: safePage > 1,
          hasNext: safePage < totalPages
        }
      }
    });
  } catch (err) {
    console.error('contentApi.getBrandDetail error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy chi tiết thương hiệu' });
  }
};

module.exports.listBlogPosts = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, 12);
    const skip = (page - 1) * limit;

    const filter = { xuatban: true };
    const [rows, total] = await Promise.all([
      BlogPost.find(filter).sort({ ngayxuatban: -1, ngaytao: -1 }).skip(skip).limit(limit).lean(),
      BlogPost.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: {
        items: rows || [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (err) {
    console.error('contentApi.listBlogPosts error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách bài viết' });
  }
};

module.exports.getBlogDetail = async (req, res) => {
  try {
    const slugFilter = slugOrIdFilter(req.params.slug);
    if (!slugFilter) return res.status(400).json({ success: false, message: 'Slug/id bài viết không hợp lệ' });

    const post = await BlogPost.findOne({ ...slugFilter, xuatban: true }).lean();
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });

    return res.json({ success: true, data: post });
  } catch (err) {
    console.error('contentApi.getBlogDetail error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy chi tiết bài viết' });
  }
};

module.exports.listLookbooks = async (req, res) => {
  try {
    const now = new Date();
    const { page, limit } = parsePagination(req.query, 12);
    const skip = (page - 1) * limit;
    const filter = buildActiveLookbookFilter(now);

    const [rows, total] = await Promise.all([
      Lookbook.find(filter).sort({ order: 1, thuTu: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Lookbook.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: {
        items: (rows || []).map(normalizeLookbook),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (err) {
    console.error('contentApi.listLookbooks error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách lookbook' });
  }
};

module.exports.getLookbookDetailBySlug = async (req, res) => {
  try {
    const now = new Date();
    const { page, limit } = parsePagination(req.query, 12);
    const slugFilter = slugOrIdFilter(req.params.slug);
    if (!slugFilter) return res.status(400).json({ success: false, message: 'Slug/id lookbook không hợp lệ' });

    const lookbook = await Lookbook.findOne({
      ...slugFilter,
      ...buildActiveLookbookFilter(now)
    }).lean();

    if (!lookbook) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lookbook' });
    }

    const ids =
      Array.isArray(lookbook.products) && lookbook.products.length
        ? lookbook.products
        : (Array.isArray(lookbook.sanpham_ids) ? lookbook.sanpham_ids : []);

    const rawProducts = ids.length
      ? await Sanpham.find({
          _id: { $in: ids },
          trangthai: 'dangban',
          daxoa: { $ne: true }
        }).lean()
      : [];

    const productMap = new Map((rawProducts || []).map((p) => [String(p._id), p]));
    const ordered = ids
      .map((id) => productMap.get(String(id)))
      .filter(Boolean)
      .map(productHelper);

    const total = ordered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const paginated = ordered.slice(start, start + limit);

    return res.json({
      success: true,
      data: {
        lookbook: normalizeLookbook(lookbook),
        products: paginated,
        pagination: {
          page: safePage,
          limit,
          total,
          totalPages,
          hasPrev: safePage > 1,
          hasNext: safePage < totalPages
        }
      }
    });
  } catch (err) {
    console.error('contentApi.getLookbookDetailBySlug error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy chi tiết lookbook' });
  }
};
