const Banner = require('../../models/banner_model');
const HomeSection = require('../../models/home_section_model');
const Setting = require('../../models/setting_model');
const Lookbook = require('../../models/lookbook_model');
const Brand = require('../../models/brand_model');
const BlogPost = require('../../models/blog_model');
const Sanpham = require('../../models/product_model');
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
    isActive('blog') ? BlogPost.find({ xuatban: true }).sort({ ngayxuatban: -1, ngaytao: -1 }).limit(blogLimit).lean() : Promise.resolve([])
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

module.exports = {
  getHomeData,
  mergeSections
};

