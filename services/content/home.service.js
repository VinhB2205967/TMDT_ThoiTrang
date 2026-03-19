const Banner = require('../../models/banner_model');
const HomeSection = require('../../models/home_section_model');
const Setting = require('../../models/setting_model');
const Lookbook = require('../../models/lookbook_model');
const Brand = require('../../models/brand_model');
const BlogPost = require('../../models/blog_model');
const Sanpham = require('../../models/product_model');
const { getFlashSaleActive } = require('../catalog/flashSale.service.js');

const defaultSections = [
  { key: 'banner_slider', tieuDe: 'Banner Slider', hienthi: true, thuTu: 1, config: {} },
  { key: 'new_products', tieuDe: 'San pham moi', hienthi: true, thuTu: 2, config: { limit: 8 } },
  { key: 'best_sellers', tieuDe: 'Ban chay nhat', hienthi: true, thuTu: 3, config: { limit: 8 } },
  { key: 'flash_sale', tieuDe: 'Flash Sale', hienthi: true, thuTu: 4, config: {} },
  { key: 'brands', tieuDe: 'Thuong hieu noi bat', hienthi: true, thuTu: 5, config: {} },
  { key: 'lookbook', tieuDe: 'Lookbook', hienthi: true, thuTu: 6, config: {} },
  { key: 'blog', tieuDe: 'Blog thoi trang', hienthi: true, thuTu: 7, config: { limit: 6 } }
];

function mergeSections(dbSections) {
  if (!Array.isArray(dbSections) || dbSections.length === 0) return [...defaultSections];
  const map = new Map(dbSections.map((s) => [s.key, s]));
  const merged = defaultSections.map((d) => ({ ...d, ...(map.get(d.key) || {}) }));
  return merged.sort((a, b) => (a.thuTu || 0) - (b.thuTu || 0));
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

