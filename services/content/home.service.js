const Banner = require('../../models/banner_model');
const HomeSection = require('../../models/home_section_model');
const Setting = require('../../models/setting_model');
const Lookbook = require('../../models/lookbook_model');
const Brand = require('../../models/brand_model');
const BlogPost = require('../../models/blog_model');
const Sanpham = require('../../models/product_model');
const productHelper = require('../../helpers/product');
const { buildProductStats, applyProductStats } = require('../../helpers/productStats');
const { getFlashSaleActive } = require('../catalog/flashSale.service.js');

const HOME_SECTION_TITLES = {
  banner_slider: 'Banner Slider',
  new_products: 'Sản phẩm mới',
  best_sellers: 'Bán chạy nhất',
  flash_sale: 'Flash Sale',
  brands: 'Thương hiệu nổi bật',
  lookbook: 'Lookbook',
  blog: 'Blog thời trang'
};

const defaultSections = [
  { key: 'banner_slider', tieuDe: 'Banner Slider', hienthi: true, thuTu: 1, config: {} },
  { key: 'new_products', tieuDe: 'Sản phẩm mới', hienthi: true, thuTu: 2, config: { limit: 8 } },
  { key: 'best_sellers', tieuDe: 'Bán chạy nhất', hienthi: true, thuTu: 3, config: { limit: 8 } },
  { key: 'flash_sale', tieuDe: 'Flash Sale', hienthi: true, thuTu: 4, config: {} },
  { key: 'brands', tieuDe: 'Thương hiệu nổi bật', hienthi: true, thuTu: 5, config: {} },
  { key: 'lookbook', tieuDe: 'Lookbook', hienthi: true, thuTu: 6, config: {} },
  { key: 'blog', tieuDe: 'Blog thời trang', hienthi: true, thuTu: 7, config: { limit: 6 } }
];

function stripHtmlTags(input) {
  return String(input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text, maxLength = 180) {
  const clean = String(text || '').trim();
  if (!clean || clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

function normalizeSectionTitle(section) {
  const key = String(section?.key || '').trim();
  if (!key || !HOME_SECTION_TITLES[key]) return section;

  const rawTitle = String(section?.tieuDe || '').trim().toLowerCase();
  const shouldReplace = !rawTitle
    || rawTitle === 'san pham moi'
    || rawTitle === 'ban chay nhat'
    || rawTitle === 'thuong hieu noi bat'
    || rawTitle === 'blog thoi trang';

  if (!shouldReplace) return section;
  return { ...section, tieuDe: HOME_SECTION_TITLES[key] };
}

function mergeSections(dbSections) {
  const raw = Array.isArray(dbSections) && dbSections.length > 0 ? dbSections : [];
  const map = new Map(raw.map((s) => [s.key, s]));
  const merged = defaultSections.map((d) => normalizeSectionTitle({ ...d, ...(map.get(d.key) || {}) }));

  const banner = merged.find((s) => s.key === 'banner_slider');
  const others = merged
    .filter((s) => s.key !== 'banner_slider')
    .sort((a, b) => (a.thuTu || 0) - (b.thuTu || 0));

  if (!banner) return others;
  return [{ ...banner, thuTu: 1 }, ...others];
}

function getSettingValue(map, key, fallback) {
  const raw = map[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const asNum = Number(raw);
  return Number.isFinite(asNum) ? asNum : raw;
}

async function getHomeData() {
  const now = new Date();
  const [sectionsDb, settingsDb] = await Promise.all([
    HomeSection.find({}).lean(),
    Setting.find({ key: { $in: ['home_new_limit', 'home_best_limit', 'home_blog_limit'] } }).lean()
  ]);

  const sections = mergeSections(sectionsDb);
  const sectionMap = new Map(sections.map((s) => [s.key, s]));
  const settings = settingsDb.reduce((acc, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {});

  const isActive = (key) => {
    const sec = sectionMap.get(key);
    return sec ? Boolean(sec.hienthi) : true;
  };

  const newLimit = Number(sectionMap.get('new_products')?.config?.limit || getSettingValue(settings, 'home_new_limit', 8));
  const bestLimit = Number(sectionMap.get('best_sellers')?.config?.limit || getSettingValue(settings, 'home_best_limit', 8));
  const blogLimit = Number(sectionMap.get('blog')?.config?.limit || getSettingValue(settings, 'home_blog_limit', 6));

  const [banners, flashSaleData, newProducts, bestSellers, lookbooks, brands, blogs] = await Promise.all([
    isActive('banner_slider') ? Banner.find({ hienthi: true }).sort({ thuTu: 1 }).lean() : Promise.resolve([]),
    isActive('flash_sale') ? getFlashSaleActive() : Promise.resolve(null),
    isActive('new_products') ? Sanpham.find({ trangthai: 'dangban', daxoa: false }).sort({ ngaytao: -1 }).limit(newLimit).lean() : Promise.resolve([]),
    isActive('best_sellers') ? Sanpham.find({ trangthai: 'dangban', daxoa: false }).sort({ luotmua: -1, ngaytao: -1 }).limit(bestLimit).lean() : Promise.resolve([]),
    isActive('lookbook')
      ? Lookbook.find({
        deletedAt: null,
        $or: [{ isActive: true }, { hienthi: true }],
        $and: [
          {
            $or: [
              { noiBat: true },
              { isFeatured: true }
            ]
          },
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
      }).sort({ order: 1, thuTu: 1, createdAt: -1 }).lean()
      : Promise.resolve([]),
    isActive('brands')
      ? Brand.find({
        daXoa: { $ne: true },
        $and: [
          { $or: [{ hienthi: true }, { isActive: true }] },
          { $or: [{ noiBat: true }, { isFeatured: true }] }
        ]
      }).sort({ order: 1, thuTu: 1, ten: 1 }).lean()
      : Promise.resolve([]),
    isActive('blog')
      ? BlogPost.find({ xuatban: true, noiBat: true }).sort({ ngayxuatban: -1, ngaytao: -1 }).limit(blogLimit).lean()
      : Promise.resolve([])
  ]);

  return {
    sections,
    banners,
    flashSale: flashSaleData,
    newProducts,
    bestSellers,
    lookbooks,
    brands,
    blogs
  };
}

function buildBadges(product) {
  const badges = [];
  const now = Date.now();
  const createdAt = product.ngaytao ? new Date(product.ngaytao).getTime() : 0;
  const isNew = createdAt && (now - createdAt) <= 14 * 24 * 60 * 60 * 1000;
  const isSale = Number(product.phantramgiamgia) > 0 || Number(product.flashSalePrice) > 0;
  const soldCount = Number(product.soldCount || product.luotmua || 0);
  const isHot = soldCount >= 10;

  if (isNew) badges.push('NEW');
  if (isSale) badges.push('SALE');
  if (isHot) badges.push('HOT');
  return badges;
}

async function getHomePageData() {
  const homeData = await getHomeData();

  const flashProducts = homeData.flashSale ? homeData.flashSale.products : [];
  const allIds = [
    ...homeData.newProducts,
    ...homeData.bestSellers,
    ...flashProducts
  ].map((p) => p && p._id).filter(Boolean);

  const { ratingMap, soldMap } = await buildProductStats(allIds);

  const withStats = (list) => applyProductStats(list.map(productHelper), ratingMap, soldMap)
    .map((p) => ({ ...p, badges: buildBadges(p) }));

  const newProducts = withStats(homeData.newProducts);
  const bestSellerProducts = withStats(homeData.bestSellers);
  const flashSaleProducts = withStats(flashProducts);
  const lookbooks = (homeData.lookbooks || []).map((book) => ({
    ...book,
    title: book.title || book.tenmua || '',
    image: book.image || book.hinhanh || '',
    description: book.description || book.mota || '',
    descriptionPreview: truncateText(stripHtmlTags(book.description || book.mota || ''), 180),
    products: Array.isArray(book.products) && book.products.length ? book.products : (book.sanpham_ids || [])
  }));

  const flashSaleEnd = homeData.flashSale?.sale?.ketthuc
    ? new Date(homeData.flashSale.sale.ketthuc).toISOString()
    : '';
  const flashSaleStart = homeData.flashSale?.sale?.batdau
    ? new Date(homeData.flashSale.sale.batdau).toISOString()
    : '';

  return {
    sections: homeData.sections.filter((s) => s.hienthi),
    banners: homeData.banners,
    flashSale: homeData.flashSale,
    flashSaleEnd,
    flashSaleStart,
    newProducts,
    bestSellerProducts,
    lookbooks,
    brands: homeData.brands,
    blogs: homeData.blogs,
    flashSaleProducts
  };
}

module.exports = {
  getHomeData,
  getHomePageData,
  mergeSections
};

