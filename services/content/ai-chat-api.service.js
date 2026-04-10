const fs = require('fs');
const {
  Sanpham,
  FlashSale,
  Lookbook,
  BlogPost,
  Yeuthich
} = require('../../models');
const Danhmuc = require('../../models/category_model');
const Brand = require('../../models/brand_model');
const { buildDataContext, askAI } = require('./aiChat.service.js');
const { rankProductsByQuery, rankProductsByImage, classifyImageCategory } = require('../catalog/openClip.service.js');
const {
  findDirectPriceMatchFast,
  findDirectPriceMatchInContext,
  buildDirectPriceAnswer,
  buildSpecificProductNotFoundAnswer
} = require('./ai-chat-price-lookup.service');

const ALLOWED_PRODUCT_TYPES = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
const OPENCLIP_IMAGE_TYPE_MIN_SCORE = Number(process.env.OPENCLIP_IMAGE_TYPE_MIN_SCORE || 0.23);
const OPENCLIP_IMAGE_TYPE_MIN_MARGIN = Number(process.env.OPENCLIP_IMAGE_TYPE_MIN_MARGIN || 0.03);
const OPENCLIP_IMAGE_DB_LIMIT_TYPED = Number(process.env.OPENCLIP_IMAGE_DB_LIMIT_TYPED || 96);
const OPENCLIP_IMAGE_DB_LIMIT_UNTYPED = Number(process.env.OPENCLIP_IMAGE_DB_LIMIT_UNTYPED || 140);
const OPENCLIP_IMAGE_DB_LIMIT_BROADENED = Number(process.env.OPENCLIP_IMAGE_DB_LIMIT_BROADENED || 180);
const OPENCLIP_IMAGE_MIN_TYPED_RESULTS = Number(process.env.OPENCLIP_IMAGE_MIN_TYPED_RESULTS || 12);
const OPENCLIP_IMAGE_RANK_LIMIT_TYPED = Number(process.env.OPENCLIP_IMAGE_RANK_LIMIT_TYPED || 72);
const OPENCLIP_IMAGE_RANK_LIMIT_UNTYPED = Number(process.env.OPENCLIP_IMAGE_RANK_LIMIT_UNTYPED || 100);
const OPENCLIP_RESULT_TOP_K = Number(process.env.OPENCLIP_RESULT_TOP_K || 48);
const OPENCLIP_UI_MAX_RESULTS = Number(process.env.OPENCLIP_UI_MAX_RESULTS || 48);
const OPENCLIP_IMAGE_CATEGORY_LABELS = [
  {
    key: 'ao',
    prompts: ['áo', 'áo thun', 'áo sơ mi', 'shirt', 't-shirt', 'fashion top']
  },
  {
    key: 'aokhoac',
    prompts: ['áo khoác', 'jacket', 'blazer', 'outerwear jacket']
  },
  {
    key: 'quan',
    prompts: ['quần', 'quần jean', 'trousers', 'pants', 'fashion bottom']
  },
  {
    key: 'vay',
    prompts: ['váy', 'đầm', 'dress', 'skirt']
  },
  {
    key: 'giay',
    prompts: ['giày', 'sneaker', 'shoe', 'sandal']
  },
  {
    key: 'tui',
    prompts: ['túi', 'túi xách', 'handbag', 'bag']
  },
  {
    key: 'phukien',
    prompts: ['phụ kiện thời trang', 'accessory', 'fashion accessory', 'thắt lưng', 'mũ']
  }
];

const QUICK_KNOWLEDGE_STOPWORDS = new Set([
  'tim', 'xem', 'cho', 'toi', 'minh', 'em', 'anh', 'chi', 'goi', 'y',
  'de', 'xuat', 'san', 'pham', 'shop', 'lookbook', 'blog', 'lofog', 'bai',
  'viet', 'tin', 'tuc', 'thoi', 'trang', 'dip', 'thuong', 'hieu', 'brand'
]);

const BRAND_QUERY_NOISE_TERMS = new Set([
  'so', 'mot', 'vai', 'nhieu', 'it', 'cac', 'nhung', 'thuong', 'hieu', 'brand'
]);

function normalizeMessage(input) {
  return String(input || '').trim();
}

function normalizeClientImageProducts(rawProducts) {
  if (!Array.isArray(rawProducts)) return [];

  return rawProducts
    .map((item) => {
      const source = item && typeof item === 'object' ? item : {};
      const id = normalizeMessage(source.id || source._id);
      const name = normalizeMessage(source.tensanpham || source.name);
      const url = normalizeMessage(source.url);
      const imageUrl = normalizeMessage(source.imageUrl || source.image);
      const salePrice = Number(source.giaSauGiam || source.price || source.gia || 0);
      const originalPrice = Number(source.gia || source.originalPrice || salePrice || 0);
      const availableSizes = Array.isArray(source.sizeCoSan)
        ? source.sizeCoSan.map((value) => normalizeMessage(value)).filter(Boolean).slice(0, 12)
        : [];

      if (!name && !url && !id) return null;

      return {
        id,
        tensanpham: name || 'San pham',
        url,
        imageUrl,
        gia: originalPrice > 0 ? originalPrice : salePrice,
        giaSauGiam: salePrice > 0 ? salePrice : originalPrice,
        sizeCoSan: availableSizes,
        openClipScore: Number(source.openClipScore || source.score || 0)
      };
    })
    .filter(Boolean)
    .slice(0, 6);
}

function mergeImageProductsIntoContext(context, imageProducts, imageMeta, question) {
  if (!context || !Array.isArray(imageProducts) || imageProducts.length === 0) return context;

  const existingProducts = Array.isArray(context.products) ? context.products : [];
  const mergedProducts = [];
  const seen = new Set();

  const pushUnique = (item) => {
    if (!item || typeof item !== 'object') return;
    const key = [
      normalizeMessage(item.id || item._id).toLowerCase(),
      normalizeMessage(item.url).toLowerCase(),
      normalizeMessage(item.tensanpham || item.name).toLowerCase()
    ].find(Boolean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    mergedProducts.push(item);
  };

  imageProducts.forEach(pushUnique);
  existingProducts.forEach(pushUnique);

  context.products = mergedProducts.slice(0, 8);
  context.openClip = {
    ...(context.openClip && typeof context.openClip === 'object' ? context.openClip : {}),
    enabled: true,
    used: true,
    source: 'client_image_upload',
    provider: normalizeMessage(imageMeta && imageMeta.provider) || 'openclip',
    model: normalizeMessage(imageMeta && imageMeta.model),
    answerSummary: normalizeMessage(imageMeta && imageMeta.answer).slice(0, 280),
    query: normalizeMessage(question),
    candidates: imageProducts.length
  };

  return context;
}

function normalizeForCompare(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLooseText(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDisplayName(item) {
  return String(
    (item && (item.name || item.tendanhmuc || item.ten || item.slug)) || ''
  ).trim();
}

function preferDisplayLabel(current, next) {
  const a = String(current || '').trim();
  const b = String(next || '').trim();
  if (!a) return b;
  if (!b) return a;

  const aHasDiacritic = /[^\x00-\x7F]/.test(a);
  const bHasDiacritic = /[^\x00-\x7F]/.test(b);
  if (aHasDiacritic !== bHasDiacritic) return bHasDiacritic ? b : a;

  return b.length > a.length ? b : a;
}

function dedupeFacetMatches(items) {
  const map = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = String(item && item.id || '').trim();
    const label = String(item && item.label || '').trim();
    if (!id || !label) return;

    const key = normalizeLooseText(label);
    if (!key) return;

    const prev = map.get(key);
    if (!prev) {
      map.set(key, { id, label });
      return;
    }

    map.set(key, {
      id,
      label: preferDisplayLabel(prev.label, label)
    });
  });

  return Array.from(map.values());
}

function extractQuickSearchTerms(question) {
  const normalized = normalizeLooseText(question);
  if (!normalized) return [];

  const tokens = normalized
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !QUICK_KNOWLEDGE_STOPWORDS.has(item));

  return Array.from(new Set(tokens)).slice(0, 8);
}

function hasAnyQuickSearchTerm(text, terms) {
  const source = normalizeLooseText(text);
  if (!source) return false;
  if (!Array.isArray(terms) || terms.length === 0) return true;
  return terms.some((term) => source.includes(term));
}

function buildQuickContextMeta({ products = 0, hasFlashSale = false } = {}) {
  return {
    products: Number(products || 0),
    hasFlashSale: Boolean(hasFlashSale),
    vouchers: 0,
    sizeGuides: 0,
    topSelling: 0,
    topRated: 0,
    openClipUsed: false,
    openClipModel: '',
    reviewsRecent: 0,
    reviewsMine: 0,
    settings: 0,
    myOrders: 0,
    myVouchers: 0
  };
}

const PRODUCT_TYPE_RULES = [
  { value: 'aokhoac', label: 'Áo khoác', patterns: [/ao\s*khoac/i, /áo\s*khoác/i, /\bjacket\b/i, /\bblazer\b/i, /\bcoat\b/i, /\bouterwear\b/i] },
  { value: 'ao', label: 'Áo', patterns: [/\bao\b/i, /áo/i, /ao\s*thun/i, /áo\s*thun/i, /so\s*mi/i, /sơ\s*mi/i, /\bshirt\b/i, /\btee\b/i, /\bpolo\b/i, /\bhoodie\b/i] },
  { value: 'quan', label: 'Quần', patterns: [/\bquan\b/i, /quần/i, /\bjean\b/i, /\bdenim\b/i, /\bshort\b/i, /\bjogger\b/i, /\btrouser\b/i, /\bpants?\b/i] },
  { value: 'vay', label: 'Váy', patterns: [/\bvay\b/i, /váy/i, /\bdam\b/i, /đầm/i, /\bdress\b/i, /\bskirt\b/i] },
  { value: 'giay', label: 'Giày', patterns: [/\bgiay\b/i, /giày/i, /\bsneaker\b/i, /\bshoe\b/i, /\bsandal\b/i, /\bboot\b/i] },
  { value: 'tui', label: 'Túi', patterns: [/\btui\b/i, /túi/i, /tui\s*xach/i, /túi\s*xách/i, /\bbag\b/i, /\bhandbag\b/i] },
  { value: 'phukien', label: 'Phụ kiện', patterns: [/\bphu\s*kien\b/i, /phụ\s*kiện/i, /\baccessor/i, /\bthat\s*lung\b/i, /thắt\s*lưng/i, /\bmu\b/i, /mũ/i, /\bnon\b/i, /nón/i, /\bhat\b/i, /\bcap\b/i, /\bscarf\b/i] }
];

function inferProductType(question) {
  const text = String(question || '');
  return PRODUCT_TYPE_RULES.find((item) => item.patterns.some((pattern) => pattern.test(text))) || null;
}

function inferGender(question) {
  const q = normalizeForCompare(question);
  if (!q) return null;
  if (/\bunisex\b/.test(q)) return { value: 'unisex', label: 'Unisex' };
  if (/\bbe gai\b|\bbegai\b|\bgirl\b|\bnu\b|\bnữ\b|\bnu gioi\b|\bnữ giới\b/.test(q)) return { value: 'nu', label: 'Nữ' };
  if (/\bbe trai\b|\bbetrai\b|\bboy\b|\bnam\b|\bnam gioi\b/.test(q)) return { value: 'nam', label: 'Nam' };
  return null;
}

function inferCoreRoute(question) {
  const q = normalizeForCompare(question);
  if (!q) return null;
  if (/\bdon hang\b|\bma don\b|\btrang thai don\b|\bgiao hang\b|\bhoan hang\b/.test(q)) {
    return { label: 'Xem đơn hàng', url: '/orders', kind: 'route' };
  }
  if (/\bvoucher\b|\bma giam gia\b|\bgiam gia\b|\bkhuyen mai\b|\bkhuyến mại\b/.test(q)) {
    return { label: 'Xem voucher', url: '/vouchers', kind: 'route' };
  }
  if (/\bsize\b|\bbang size\b|\bbảng size\b|\bkich co\b|\bkích cỡ\b/.test(q)) {
    return { label: 'Xem bảng size', url: '/size-guide', kind: 'route' };
  }
  if (/\bgio hang\b|\bgiỏ hàng\b|\bcart\b/.test(q)) {
    return { label: 'Mở giỏ hàng', url: '/cart', kind: 'route' };
  }
  return null;
}

function buildProductsUrl(filters = {}) {
  const params = new URLSearchParams();
  const push = (key, value) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;
    params.set(key, text);
  };

  push('loaisanpham', filters.loaisanpham);
  push('gioitinh', filters.gioitinh);
  push('brand', filters.brand);
  push('occasion', filters.occasion);
  push('ageGroup', filters.ageGroup);
  push('priceMin', filters.priceMin);
  push('priceMax', filters.priceMax);
  push('sort', filters.sort);
  push('keyword', filters.keyword);

  const query = params.toString();
  return query ? `/products?${query}` : '/products';
}

function pushUniqueAction(actions, action) {
  const item = action && typeof action === 'object' ? action : null;
  if (!item || !item.label || !item.url) return;
  const key = `${String(item.label).trim().toLowerCase()}|${String(item.url).trim()}`;
  if (actions.some((entry) => `${String(entry.label).trim().toLowerCase()}|${String(entry.url).trim()}` === key)) {
    return;
  }
  actions.push({
    label: String(item.label).trim(),
    url: String(item.url).trim(),
    kind: String(item.kind || 'link').trim()
  });
}

async function findMatchedOccasions(question) {
  const q = normalizeLooseText(question);
  if (!q) return [];

  const aliases = [
    { term: 'di choi', patterns: [/di\s*choi/i, /đi\s*chơi/i] },
    { term: 'di lam', patterns: [/di\s*lam/i, /đi\s*làm/i] },
    { term: 'du tiec', patterns: [/du\s*tiec/i, /dự\s*tiệc/i, /\bparty\b/i] },
    { term: 'the thao', patterns: [/the\s*thao/i, /thể\s*thao/i, /\bsport\b/i] },
    { term: 'o nha', patterns: [/o\s*nha/i, /ở\s*nhà/i, /\bhome\b/i] }
  ];
  const wanted = aliases
    .filter((item) => item.patterns.some((pattern) => pattern.test(String(question || ''))))
    .map((item) => item.term);

  if (!wanted.length) return [];

  const rows = await Danhmuc.find({
    daxoa: { $ne: true },
    type: 'occasion',
    isActive: true
  }).select('_id name tendanhmuc slug').lean();

  const mapped = (rows || [])
    .filter((item) => {
      const label = normalizeLooseText(getDisplayName(item));
      return wanted.some((term) => label.includes(term));
    })
    .map((item) => ({
      id: String(item._id || ''),
      label: getDisplayName(item)
    }))
    .filter((item) => item.id && item.label);

  return dedupeFacetMatches(mapped);
}

async function findMatchedAgeGroups(question) {
  const rawQuestion = String(question || '');
  const normalizedQuestion = String(question || '').toLowerCase();
  const asciiQuestion = normalizeLooseText(question);
  if (!asciiQuestion) return [];

  const rows = await Danhmuc.find({
    daxoa: { $ne: true },
    type: 'age_group',
    isActive: true
  }).select('_id name tendanhmuc slug').lean();

  const requestedAges = [];
  let minRequestedAge = null;
  let maxRequestedAge = null;

  const minAgeMatch = normalizedQuestion.match(/(?:tu\s*|from\s*)(\d{1,2})\s*(?:tuoi|tuổi)\s*(?:tro len|trở lên|len|lớn hơn|lon hon)/i)
    || asciiQuestion.match(/(?:tu\s*|from\s*)(\d{1,2})\s*tuoi\s*(?:tro len|len|lon hon)/i);
  if (minAgeMatch) {
    const value = Number(minAgeMatch[1] || 0);
    if (Number.isFinite(value) && value > 0 && value <= 120) minRequestedAge = value;
  }

  const ageRangeMatch = normalizedQuestion.match(/(?:tu\s*|from\s*)(\d{1,2})\s*(?:tuoi|tuổi)?\s*(?:den|đến|toi|tới|-)\s*(\d{1,2})\s*(?:tuoi|tuổi)?/i)
    || asciiQuestion.match(/(?:tu\s*|from\s*)(\d{1,2})\s*tuoi?\s*(?:den|toi|-)\s*(\d{1,2})\s*tuoi?/i);
  if (ageRangeMatch) {
    const a = Number(ageRangeMatch[1] || 0);
    const b = Number(ageRangeMatch[2] || 0);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      minRequestedAge = Math.min(a, b);
      maxRequestedAge = Math.max(a, b);
    }
  }

  const collectAgeMatches = (sourceText) => {
    const agePattern = /(\d{1,2})\s*(?:tuoi|tuổi)\b|(?:tuoi|tuổi)\s*(\d{1,2})/gi;
    const matches = String(sourceText || '').matchAll(agePattern);
    for (const match of matches) {
      const ageValue = Number(match[1] || match[2] || 0);
      if (Number.isFinite(ageValue) && ageValue > 0 && ageValue <= 120) {
        requestedAges.push(ageValue);
      }
    }
  };

  collectAgeMatches(rawQuestion);
  collectAgeMatches(asciiQuestion);

  const mapped = (rows || [])
    .filter((item) => {
      const label = String(getDisplayName(item) || '').toLowerCase();
      const normalizedLabel = normalizeLooseText(label);
      if (!normalizedLabel) return false;

      if (normalizedQuestion.includes(label) || asciiQuestion.includes(normalizedLabel)) {
        return true;
      }

      const rangeMatch = normalizedLabel.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
      if (!rangeMatch) return false;
      const min = Number(rangeMatch[1] || 0);
      const max = Number(rangeMatch[2] || 0);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return false;

      if (Number.isFinite(minRequestedAge) && !Number.isFinite(maxRequestedAge)) {
        return max >= minRequestedAge;
      }

      if (Number.isFinite(minRequestedAge) && Number.isFinite(maxRequestedAge)) {
        return Math.max(min, minRequestedAge) <= Math.min(max, maxRequestedAge);
      }

      return requestedAges.some((age) => age >= min && age <= max);
    })
    .map((item) => ({
      id: String(item._id || ''),
      label: getDisplayName(item)
    }))
    .filter((item) => item.id && item.label);

  return dedupeFacetMatches(mapped);
}

async function findMatchedBrands(question) {
  const q = normalizeLooseText(question);
  if (!q) return [];

  const rows = await Brand.find({
    daXoa: { $ne: true },
    $or: [{ isActive: true }, { hienthi: true }]
  }).select('_id ten slug').lean();

  const mapped = (rows || [])
    .filter((item) => {
      const label = normalizeLooseText(getDisplayName(item));
      if (!label || label.length < 2) return false;
      return q.includes(label);
    })
    .map((item) => ({
      id: String(item._id || ''),
      label: getDisplayName(item)
    }))
    .filter((item) => item.id && item.label)
    .slice(0, 6);

  return dedupeFacetMatches(mapped).slice(0, 2);
}

async function buildSuggestedActions({ question, context, exactOrder }) {
  const actions = [];
  const typeMatch = inferProductType(question);
  const genderMatch = inferGender(question);
  const coreRoute = inferCoreRoute(question);

  if (exactOrder) {
    pushUniqueAction(actions, { label: 'Xem đơn hàng', url: '/orders', kind: 'primary' });
  }

  const [occasionMatches, ageGroupMatches, brandMatches] = await Promise.all([
    findMatchedOccasions(question),
    findMatchedAgeGroups(question),
    findMatchedBrands(question)
  ]);

  const baseFilters = {};
  if (typeMatch) baseFilters.loaisanpham = typeMatch.value;
  if (genderMatch) baseFilters.gioitinh = genderMatch.value;
  if (brandMatches.length === 1) baseFilters.brand = brandMatches[0].id;
  if (occasionMatches.length === 1) baseFilters.occasion = occasionMatches[0].id;
  if (ageGroupMatches.length === 1) baseFilters.ageGroup = ageGroupMatches[0].id;
  const primaryFilters = {
    ...baseFilters,
    ...(baseFilters.brand ? {} : (brandMatches[0] ? { brand: brandMatches[0].id } : {})),
    ...(baseFilters.occasion ? {} : (occasionMatches[0] ? { occasion: occasionMatches[0].id } : {})),
    ...(baseFilters.ageGroup ? {} : (ageGroupMatches[0] ? { ageGroup: ageGroupMatches[0].id } : {}))
  };

  const hasFacetFilters = Boolean(
    typeMatch
    || genderMatch
    || brandMatches.length
    || occasionMatches.length
    || ageGroupMatches.length
  );

  if (hasFacetFilters) {
    pushUniqueAction(actions, {
      label: 'Xem sản phẩm phù hợp',
      url: buildProductsUrl(primaryFilters),
      kind: 'primary'
    });
  }

  if (typeMatch) {
    pushUniqueAction(actions, {
      label: typeMatch.label,
      url: buildProductsUrl({ ...baseFilters, loaisanpham: typeMatch.value }),
      kind: 'filter'
    });
  }

  if (genderMatch) {
    pushUniqueAction(actions, {
      label: genderMatch.label,
      url: buildProductsUrl({ ...baseFilters, gioitinh: genderMatch.value }),
      kind: 'filter'
    });
  }

  occasionMatches.slice(0, 2).forEach((item) => {
    pushUniqueAction(actions, {
      label: item.label,
      url: buildProductsUrl({ ...baseFilters, occasion: item.id }),
      kind: 'filter'
    });
  });

  ageGroupMatches.slice(0, 2).forEach((item) => {
    pushUniqueAction(actions, {
      label: item.label,
      url: buildProductsUrl({ ...baseFilters, ageGroup: item.id }),
      kind: 'filter'
    });
  });

  brandMatches.slice(0, 2).forEach((item) => {
    pushUniqueAction(actions, {
      label: item.label,
      url: buildProductsUrl({ ...baseFilters, brand: item.id }),
      kind: 'filter'
    });
  });

  if (!hasFacetFilters && shouldSuggestProducts(question) && Array.isArray(context && context.products) && context.products.length > 0) {
    pushUniqueAction(actions, {
      label: 'Mở danh sách sản phẩm',
      url: '/products',
      kind: 'primary'
    });
  }

  if (coreRoute) {
    pushUniqueAction(actions, coreRoute);
  }

  return actions.slice(0, 5);
}

const ADMIN_DIRECT_PATTERNS = [
  /\badmin\b/,
  /\bquan tri\b/,
  /\bban quan tri\b/,
  /\bquan ly cua hang\b/,
  /\bquan ly shop\b/,
  /\bquan ly he thong\b/,
  /\bdoanh thu\b/,
  /\bdoanh so\b/,
  /\bloi nhuan\b/,
  /\blai rong\b/,
  /\blai gop\b/,
  /\bchi phi\b/,
  /\bbien loi nhuan\b/,
  /\bkpi\b/,
  /\bdashboard\b/,
  /\bbao cao\b/,
  /\bton kho\b/,
  /\bhang ton\b/,
  /\bnhap kho\b/,
  /\bxuat kho\b/,
  /\bphieu nhap\b/,
  /\bphieu xuat\b/,
  /\bdieu chinh kho\b/,
  /\btop khach hang\b/,
  /\bphan khuc khach hang\b/,
  /\bty le chuyen doi\b/,
  /\bconversion rate\b/,
  /\bhieu suat ban hang\b/
];

const ADMIN_ACTION_PATTERN = /\b(thong ke|bao cao|phan tich|tong hop|tong ket|liet ke|so sanh|xep hang|top|nhieu nhat|it nhat|bao nhieu|tong so)\b/;
const ADMIN_OBJECT_PATTERN = /\b(don hang|san pham|khach hang|nguoi dung|voucher|ma giam gia|danh muc|thuong hieu)\b/;
const ADMIN_SCOPE_PATTERN = /\b(toan shop|toan he thong|cua hang|shop|he thong|hom nay|tuan nay|thang nay|quy nay|nam nay)\b/;

function isAdminRelatedQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;

  if (ADMIN_DIRECT_PATTERNS.some((pattern) => pattern.test(q))) return true;

  if (ADMIN_ACTION_PATTERN.test(q) && ADMIN_OBJECT_PATTERN.test(q) && ADMIN_SCOPE_PATTERN.test(q)) {
    return true;
  }

  if (/\b(don hang|khach hang|nguoi dung)\b/.test(q) && /\b(toan shop|toan he thong|cua hang|shop|he thong)\b/.test(q)) {
    return true;
  }

  return false;
}

function buildAdminRestrictionAnswer() {
  return '\u0054r\u1ee3 l\u00fd n\u00e0y ch\u1ec9 h\u1ed7 tr\u1ee3 kh\u00e1ch mua s\u1eafm n\u00ean m\u00ecnh kh\u00f4ng tr\u1ea3 l\u1eddi c\u00e1c c\u00e2u h\u1ecfi thu\u1ed9c ph\u1ea1m vi qu\u1ea3n tr\u1ecb nh\u01b0 doanh thu, l\u1ee3i nhu\u1eadn, t\u1ed3n kho, b\u00e1o c\u00e1o ho\u1eb7c th\u1ed1ng k\u00ea n\u1ed9i b\u1ed9. B\u1ea1n c\u00f3 th\u1ec3 h\u1ecfi m\u00ecnh v\u1ec1 s\u1ea3n ph\u1ea9m, gi\u00e1, size, khuy\u1ebfn m\u1ea1i, voucher ho\u1eb7c \u0111\u01a1n h\u00e0ng c\u1ee7a b\u1ea1n.';
}

function getCurrentPriceFromRecord(item) {
  const row = item && typeof item === 'object' ? item : {};
  const candidates = [];

  const fromVirtual = Number(row.giaMoi || 0);
  if (Number.isFinite(fromVirtual) && fromVirtual > 0) candidates.push(fromVirtual);

  const fromDiscountField = Number(row.giaSauGiam || 0);
  if (Number.isFinite(fromDiscountField) && fromDiscountField > 0) candidates.push(fromDiscountField);

  const base = Number(row.gia || 0);
  const percent = Number(row.phantramgiamgia || 0);
  if (base > 0) {
    const effectiveBase = percent > 0 ? Math.round(base * (1 - percent / 100)) : base;
    if (effectiveBase > 0) candidates.push(effectiveBase);
  }

  if (Array.isArray(row.bienthe)) {
    row.bienthe.forEach((variant) => {
      if (!variant || typeof variant !== 'object') return;
      const variantBase = Number(variant.gia || 0);
      if (!Number.isFinite(variantBase) || variantBase <= 0) return;
      const variantPercent = Number(variant.phantramgiamgia || 0);
      const variantCurrent = variantPercent > 0
        ? Math.round(variantBase * (1 - variantPercent / 100))
        : variantBase;
      if (variantCurrent > 0) candidates.push(variantCurrent);
    });
  }

  if (candidates.length === 0) return 0;
  return Math.min(...candidates);
}

function parseMoneyToVnd(valueText, unitText = '') {
  const rawNumber = String(valueText || '').replace(/\s+/g, '').replace(/,/g, '.').replace(/\.(?=\d{3}(\D|$))/g, '');
  const base = Number(rawNumber);
  if (!Number.isFinite(base) || base <= 0) return 0;

  const unit = String(unitText || '').toLowerCase();
  if (unit.startsWith('tr') || unit.includes('trieu') || unit.includes('triệu')) return Math.round(base * 1000000);
  if (unit === 'k' || unit.includes('ngan') || unit.includes('ngàn')) return Math.round(base * 1000);
  // Vietnamese shopping queries often use shorthand like "duoi 60" meaning 60.000đ.
  if (!unit && base < 1000) return Math.round(base * 1000);
  return Math.round(base);
}

function extractPriceConstraint(question) {
  const q = String(question || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

  if (!q) return null;
  const amount = '(\\d[\\d\\s.,]*)(?:\\s*(k|ngan|tr|trieu|d))?';

  const rangeMatch = q.match(new RegExp(`(?:tu|from)\\s*${amount}\\s*(?:den|toi|to|-)\\s*${amount}`));
  if (rangeMatch) {
    const min = parseMoneyToVnd(rangeMatch[1], rangeMatch[2]);
    const max = parseMoneyToVnd(rangeMatch[3], rangeMatch[4]);
    if (min > 0 && max > 0) {
      return {
        min: Math.min(min, max),
        max: Math.max(min, max),
        minInclusive: true,
        maxInclusive: true
      };
    }
  }

  const underMatch = q.match(new RegExp(`(?:duoi|nho hon|it hon|less than)\\s*${amount}`));
  if (underMatch) {
    const max = parseMoneyToVnd(underMatch[1], underMatch[2]);
    if (max > 0) return { max, maxInclusive: false };
  }

  const maxMatch = q.match(new RegExp(`(?:toi da|khong qua|khong vuot qua|max|duoi bang|<=)\\s*${amount}`));
  if (maxMatch) {
    const max = parseMoneyToVnd(maxMatch[1], maxMatch[2]);
    if (max > 0) return { max, maxInclusive: true };
  }

  const overMatch = q.match(new RegExp(`(?:tren|lon hon|hon|more than|greater than)\\s*${amount}`));
  if (overMatch) {
    const min = parseMoneyToVnd(overMatch[1], overMatch[2]);
    if (min > 0) return { min, minInclusive: false };
  }

  const minMatch = q.match(new RegExp(`(?:tu|from|>=|tren bang)\\s*${amount}`));
  if (minMatch) {
    const min = parseMoneyToVnd(minMatch[1], minMatch[2]);
    if (min > 0) return { min, minInclusive: true };
  }

  return null;
}

function matchPriceConstraint(price, constraint) {
  const amount = Number(price || 0);
  if (!constraint || !Number.isFinite(amount) || amount <= 0) return true;

  if (Number.isFinite(constraint.min)) {
    const allow = constraint.minInclusive ? amount >= constraint.min : amount > constraint.min;
    if (!allow) return false;
  }

  if (Number.isFinite(constraint.max)) {
    const allow = constraint.maxInclusive ? amount <= constraint.max : amount < constraint.max;
    if (!allow) return false;
  }

  return true;
}

function applyPriceConstraintToProducts(products, constraint) {
  const rows = Array.isArray(products) ? products : [];
  if (!constraint) return rows;
  return rows.filter((item) => {
    const finalPrice = Number(item && (item.giaSauGiam || item.gia) || 0);
    return matchPriceConstraint(finalPrice, constraint);
  });
}

async function getActiveFlashSalePriceMap(productIds) {
  const ids = Array.isArray(productIds)
    ? productIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (ids.length === 0) return new Map();

  const now = new Date();
  const sales = await FlashSale.find({
    hienthi: true,
    batdau: { $lte: now },
    ketthuc: { $gte: now },
    'sanpham.sanpham_id': { $in: ids }
  })
    .select('phantramgiamgia sanpham')
    .lean();

  const map = new Map();
  (sales || []).forEach((sale) => {
    const salePercent = Number(sale && sale.phantramgiamgia || 0);
    const items = Array.isArray(sale && sale.sanpham) ? sale.sanpham : [];
    items.forEach((entry) => {
      const id = String(entry && entry.sanpham_id || '').trim();
      if (!id || !ids.includes(id)) return;

      const fixedPrice = Number(entry && entry.giagiam || 0);
      const prev = map.get(id) || { percent: 0, fixedPrice: 0 };
      map.set(id, {
        percent: Math.max(Number(prev.percent || 0), salePercent),
        fixedPrice: fixedPrice > 0
          ? (Number(prev.fixedPrice || 0) > 0 ? Math.min(Number(prev.fixedPrice || 0), fixedPrice) : fixedPrice)
          : Number(prev.fixedPrice || 0)
      });
    });
  });

  return map;
}

function applyFlashSaleToCurrentPrice({ record, currentPrice, flashEntry }) {
  const basePrice = Number(record && record.gia || 0);
  const priceCandidates = [];
  const current = Number(currentPrice || 0);
  if (current > 0) priceCandidates.push(current);

  const flash = flashEntry && typeof flashEntry === 'object' ? flashEntry : null;
  if (flash) {
    const percent = Number(flash.percent || 0);
    if (basePrice > 0 && percent > 0) {
      priceCandidates.push(Math.round(basePrice * (1 - percent / 100)));
    }

    const fixed = Number(flash.fixedPrice || 0);
    if (fixed > 0 && (basePrice <= 0 || fixed <= basePrice)) {
      priceCandidates.push(fixed);
    }
  }

  if (priceCandidates.length === 0) return 0;
  return Math.min(...priceCandidates.filter((value) => Number.isFinite(value) && value > 0));
}

function isPriceListingQuestion(question, priceConstraint) {
  if (!priceConstraint) return false;
  const q = normalizeForCompare(question);
  if (!q) return false;
  if (/\bdon hang|ma don|voucher|bang size|size guide\b/.test(q)) return false;
  if (/gia cua|gia ban cua|bao nhieu tien cua/.test(q)) return false;
  return shouldSuggestProducts(question);
}

function buildPriceListUrlFromConstraint(constraint) {
  const filters = {};
  if (Number.isFinite(constraint && constraint.min)) filters.priceMin = String(constraint.min);
  if (Number.isFinite(constraint && constraint.max)) filters.priceMax = String(constraint.max);
  return buildProductsUrl(filters);
}

function toSuggestedCard(item) {
  const finalPrice = Number(item && (item.giaSauGiam || item.gia) || 0);
  const originalPrice = Number(item && item.gia || 0);
  const hasDiscount = originalPrice > 0 && finalPrice > 0 && finalPrice < originalPrice;
  return {
    id: String(item && item.id || ''),
    name: String(item && item.tensanpham || 'Sản phẩm'),
    url: String(item && item.url || ''),
    imageUrl: String(item && item.imageUrl || '/images/shopping.png'),
    price: finalPrice,
    originalPrice,
    hasDiscount,
    priceText: finalPrice > 0 ? `${finalPrice.toLocaleString('vi-VN')}đ` : '',
    originalPriceText: hasDiscount ? `${originalPrice.toLocaleString('vi-VN')}đ` : ''
  };
}

async function getQuickProductsByPriceConstraint(priceConstraint) {
  const baseFilter = {
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] }
  };

  if (Number.isFinite(priceConstraint && priceConstraint.min)) {
    baseFilter.gia = { ...(baseFilter.gia || {}), $gte: Math.floor(Number(priceConstraint.min) * 0.6) };
  }
  if (Number.isFinite(priceConstraint && priceConstraint.max)) {
    baseFilter.gia = { ...(baseFilter.gia || {}), $lte: Math.ceil(Number(priceConstraint.max) * 1.8) };
  }

  const rows = await Sanpham.find(baseFilter)
    .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe ngaycapnhat ngaytao')
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .limit(260)
    .lean({ virtuals: true });

  if (!Array.isArray(rows) || rows.length === 0) return [];

  const flashMap = await getActiveFlashSalePriceMap(rows.map((item) => item && item._id));
  const mapped = rows.map((item) => {
    const basePrice = Number(item && item.gia || 0);
    const currentPrice = getCurrentPriceFromRecord(item);
    const finalPrice = applyFlashSaleToCurrentPrice({
      record: item,
      currentPrice,
      flashEntry: flashMap.get(String(item && item._id || ''))
    });

    return {
      id: String(item && item._id || ''),
      tensanpham: String(item && item.tensanpham || 'Sản phẩm'),
      imageUrl: String(item && item.hinhanh || '/images/shopping.png'),
      url: item && item._id ? `/products/${item._id}` : '',
      gia: basePrice,
      giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice
    };
  });

  const filtered = mapped.filter((item) => matchPriceConstraint(item.giaSauGiam || item.gia, priceConstraint));
  return filtered.slice(0, 8);
}

function buildQuickPriceListingAnswer(products, priceConstraint) {
  const items = Array.isArray(products) ? products.slice(0, 6) : [];
  if (!items.length) return '';

  const listUrl = buildPriceListUrlFromConstraint(priceConstraint);
  const lines = ['Mình tìm nhanh được một số sản phẩm phù hợp tầm giá của bạn:'];
  items.forEach((item, index) => {
    const price = Number(item && (item.giaSauGiam || item.gia) || 0);
    const priceText = price > 0 ? `${price.toLocaleString('vi-VN')}đ` : 'Liên hệ';
    const url = String(item && item.url || '').trim();
    lines.push(`${index + 1}. ${item && item.tensanpham ? item.tensanpham : 'Sản phẩm'}: ${priceText}${url ? ` (tại đây: ${url})` : ''}`);
  });
  lines.push(`Bạn xem thêm danh sách đầy đủ tại đây: ${listUrl}`);
  return lines.join('\n');
}

function buildFacetFiltersForUrl({
  typeMatch,
  genderMatch,
  brandMatches,
  occasionMatches,
  ageGroupMatches,
  priceConstraint
}) {
  const filters = {};
  if (typeMatch && typeMatch.value) filters.loaisanpham = typeMatch.value;
  if (genderMatch && genderMatch.value) filters.gioitinh = genderMatch.value;
  if (Array.isArray(brandMatches) && brandMatches[0] && brandMatches[0].id) filters.brand = brandMatches[0].id;
  if (Array.isArray(occasionMatches) && occasionMatches[0] && occasionMatches[0].id) filters.occasion = occasionMatches[0].id;
  if (Array.isArray(ageGroupMatches) && ageGroupMatches[0] && ageGroupMatches[0].id) filters.ageGroup = ageGroupMatches[0].id;
  if (Number.isFinite(priceConstraint && priceConstraint.min)) filters.priceMin = String(priceConstraint.min);
  if (Number.isFinite(priceConstraint && priceConstraint.max)) filters.priceMax = String(priceConstraint.max);
  return filters;
}

function isFacetListingQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;
  if (/\bdon hang|ma don|voucher|bang size|size guide\b/.test(q)) return false;
  if (/gia cua|gia ban cua|bao nhieu tien cua/.test(q)) return false;
  if (/\blookbook\b|\bblog\b|\bbai viet\b|\btin tuc\b/.test(q)) return false;

  return Boolean(
    inferProductType(question)
    || inferGender(question)
    || isProductFilterQuestion(question)
  );
}

async function getQuickProductsByFacet({ question, priceConstraint }) {
  const typeMatch = inferProductType(question);
  const genderMatch = inferGender(question);
  const [occasionMatches, ageGroupMatches, brandMatches] = await Promise.all([
    findMatchedOccasions(question),
    findMatchedAgeGroups(question),
    findMatchedBrands(question)
  ]);

  const hasFacet = Boolean(
    typeMatch
    || genderMatch
    || occasionMatches.length
    || ageGroupMatches.length
    || brandMatches.length
  );

  if (!hasFacet) {
    return {
      products: [],
      typeMatch,
      genderMatch,
      occasionMatches,
      ageGroupMatches,
      brandMatches
    };
  }

  const baseFilter = {
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] }
  };

  if (typeMatch) baseFilter.loaisanpham = typeMatch.value;
  if (genderMatch) {
    baseFilter.gioitinh = genderMatch.value === 'unisex'
      ? { $in: ['unisex', 'nam', 'nu'] }
      : genderMatch.value;
  }
  if (Number.isFinite(priceConstraint && priceConstraint.min)) {
    baseFilter.gia = { ...(baseFilter.gia || {}), $gte: Math.floor(Number(priceConstraint.min) * 0.55) };
  }
  if (Number.isFinite(priceConstraint && priceConstraint.max)) {
    baseFilter.gia = { ...(baseFilter.gia || {}), $lte: Math.ceil(Number(priceConstraint.max) * 1.8) };
  }

  const brandIds = brandMatches.map((item) => String(item && item.id || '').trim()).filter(Boolean);
  const occasionIds = occasionMatches.map((item) => String(item && item.id || '').trim()).filter(Boolean);
  const ageGroupIds = ageGroupMatches.map((item) => String(item && item.id || '').trim()).filter(Boolean);

  const facetClauses = [];
  if (brandIds.length > 0) {
    facetClauses.push({
      $or: [
        { brand: { $in: brandIds } },
        { thuonghieu_id: { $in: brandIds } },
        { thuonghieu: { $in: brandIds } }
      ]
    });
  }
  if (occasionIds.length > 0) {
    facetClauses.push({
      $or: [
        { occasion: { $in: occasionIds } },
        { dip_sudung_id: { $in: occasionIds } },
        { occasions: { $in: occasionIds } }
      ]
    });
  }
  if (ageGroupIds.length > 0) {
    facetClauses.push({
      $or: [
        { ageGroup: { $in: ageGroupIds } },
        { nhomtuoi_id: { $in: ageGroupIds } }
      ]
    });
  }

  const strictFilter = { ...baseFilter };
  if (facetClauses.length > 0) strictFilter.$and = facetClauses;

  let rows = await Sanpham.find(strictFilter)
    .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe ngaycapnhat ngaytao')
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .limit(260)
    .lean({ virtuals: true });

  if ((!Array.isArray(rows) || rows.length === 0) && facetClauses.length > 1) {
    const relaxedFilter = { ...baseFilter, $and: [facetClauses[0]] };
    rows = await Sanpham.find(relaxedFilter)
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe ngaycapnhat ngaytao')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(260)
      .lean({ virtuals: true });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      products: [],
      typeMatch,
      genderMatch,
      occasionMatches,
      ageGroupMatches,
      brandMatches
    };
  }

  const flashMap = await getActiveFlashSalePriceMap(rows.map((item) => item && item._id));
  const mapped = rows.map((item) => {
    const basePrice = Number(item && item.gia || 0);
    const currentPrice = getCurrentPriceFromRecord(item);
    const finalPrice = applyFlashSaleToCurrentPrice({
      record: item,
      currentPrice,
      flashEntry: flashMap.get(String(item && item._id || ''))
    });

    return {
      id: String(item && item._id || ''),
      tensanpham: String(item && item.tensanpham || 'Sản phẩm'),
      imageUrl: String(item && item.hinhanh || '/images/shopping.png'),
      url: item && item._id ? `/products/${item._id}` : '',
      gia: basePrice,
      giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice
    };
  });

  const filtered = mapped
    .filter((item) => matchPriceConstraint(item.giaSauGiam || item.gia, priceConstraint))
    .slice(0, 8);

  return {
    products: filtered,
    typeMatch,
    genderMatch,
    occasionMatches,
    ageGroupMatches,
    brandMatches
  };
}

function isFavoritesQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;
  return /\byeu thich cua toi\b|\byeu thich cua minh\b|\bdanh sach yeu thich\b|\bsan pham yeu thich\b|\bwishlist\b|\bfavorite cua toi\b/.test(q);
}

function productBelongsToAnyBrand(product, brandIds) {
  const ids = Array.isArray(brandIds) ? brandIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (ids.length === 0) return false;
  const source = product && typeof product === 'object' ? product : {};
  const values = [
    String(source.brand || '').trim(),
    String(source.thuonghieu_id || '').trim(),
    String(source.thuonghieu || '').trim()
  ].filter(Boolean);
  if (values.length === 0) return false;
  return values.some((value) => ids.includes(value));
}

function buildQuickFavoritesAnswer({ totalFavorites, selectedProducts, brandMatch }) {
  const items = Array.isArray(selectedProducts) ? selectedProducts.slice(0, 6) : [];
  const brandLabel = brandMatch && brandMatch.label ? String(brandMatch.label).trim() : '';

  if (brandLabel) {
    const lines = [
      `Bạn đang có ${Number(totalFavorites || 0)} sản phẩm trong danh sách yêu thích.`,
      items.length > 0
        ? `Trong thương hiệu ${brandLabel}, mình thấy ${items.length} sản phẩm phù hợp:`
        : `Hiện bạn chưa có sản phẩm yêu thích thuộc thương hiệu ${brandLabel}.`
    ];
    items.forEach((item, index) => {
      const price = Number(item && (item.giaSauGiam || item.gia) || 0);
      const priceText = price > 0 ? `${price.toLocaleString('vi-VN')}đ` : 'Liên hệ';
      const url = String(item && item.url || '').trim();
      lines.push(`${index + 1}. ${item && item.tensanpham ? item.tensanpham : 'Sản phẩm'}: ${priceText}${url ? ` (tại đây: ${url})` : ''}`);
    });
    return lines.join('\n');
  }

  const lines = [`Bạn đang có ${Number(totalFavorites || 0)} sản phẩm trong danh sách yêu thích.`];
  if (items.length > 0) {
    lines.push('Mình gửi nhanh một số sản phẩm bạn đã yêu thích:');
    items.forEach((item, index) => {
      const price = Number(item && (item.giaSauGiam || item.gia) || 0);
      const priceText = price > 0 ? `${price.toLocaleString('vi-VN')}đ` : 'Liên hệ';
      const url = String(item && item.url || '').trim();
      lines.push(`${index + 1}. ${item && item.tensanpham ? item.tensanpham : 'Sản phẩm'}: ${priceText}${url ? ` (tại đây: ${url})` : ''}`);
    });
  }

  return lines.join('\n');
}

function isBrandListingQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;

  const hasBrandIntent = /\bthuong hieu\b|\bthuong hien\b|\bthuonghieu\b|\bbrand\b/.test(q);
  if (!hasBrandIntent) return false;

  // If user explicitly asks products under brand, route to product facet flow.
  if (/\bsan pham\b|\bsp\b|\bitem\b/.test(q)) return false;
  if (/\bgia\b|\bbao nhieu\b|\bduoi\b|\btren\b/.test(q)) return false;

  return true;
}

async function getQuickBrandListingPayload(question) {
  if (!isBrandListingQuestion(question)) return null;

  const rows = await Brand.find({
    daXoa: { $ne: true },
    $or: [{ isActive: true }, { hienthi: true }]
  })
    .select('_id ten slug')
    .sort({ ten: 1, createdAt: -1 })
    .limit(80)
    .lean();

  const mapped = (rows || []).map((item) => {
    const label = getDisplayName(item);
    const slug = String(item && item.slug || '').trim();
    return {
      id: String(item && item._id || '').trim(),
      label,
      url: slug ? `/brands/${slug}` : '/brands'
    };
  }).filter((item) => item.id && item.label);

  if (mapped.length === 0) return null;

  const terms = extractQuickSearchTerms(question).filter((term) => {
    if (!term) return false;
    if (BRAND_QUERY_NOISE_TERMS.has(term)) return false;
    if (/^\d+$/.test(term)) return false;
    return term.length >= 2;
  });

  const matched = terms.length > 0
    ? mapped.filter((item) => {
      const labelNorm = normalizeLooseText(item.label);
      return terms.some((term) => labelNorm.includes(term));
    })
    : mapped;

  const selected = (matched.length > 0 ? matched : mapped).slice(0, 8);
  const lines = ['Hiện tại shop có các thương hiệu sau:'];
  selected.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.label} (tại đây: ${item.url})`);
  });
  lines.push('Bạn có thể xem tất cả tại đây: /brands');

  const suggestedActions = [
    { label: 'Xem thương hiệu', url: '/brands', kind: 'primary' }
  ];
  if (selected[0] && selected[0].url) {
    pushUniqueAction(suggestedActions, { label: 'Tại đây', url: selected[0].url, kind: 'link' });
  }

  return {
    answer: lines.join('\n'),
    suggestedProducts: [],
    suggestedActions: suggestedActions.slice(0, 5),
    contextMeta: buildQuickContextMeta()
  };
}

async function getQuickFavoritesPayload({ userId, question }) {
  if (!isFavoritesQuestion(question)) return null;

  if (!userId) {
    return {
      answer: 'Bạn cần đăng nhập để mình xem danh sách yêu thích của bạn.',
      suggestedProducts: [],
      suggestedActions: [{ label: 'Đăng nhập', url: '/login', kind: 'primary' }],
      contextMeta: buildQuickContextMeta()
    };
  }

  const favoriteRows = await Yeuthich.find({ nguoidung_id: userId })
    .sort({ ngaythem: -1 })
    .select('sanpham_id')
    .limit(240)
    .lean();

  const favoriteIds = Array.from(new Set(
    (favoriteRows || [])
      .map((item) => String(item && item.sanpham_id || '').trim())
      .filter(Boolean)
  ));

  if (favoriteIds.length === 0) {
    return {
      answer: 'Bạn chưa có sản phẩm nào trong danh sách yêu thích.',
      suggestedProducts: [],
      suggestedActions: [{ label: 'Xem sản phẩm', url: '/products', kind: 'primary' }],
      contextMeta: buildQuickContextMeta()
    };
  }

  const productRows = await Sanpham.find({
    _id: { $in: favoriteIds },
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] }
  })
    .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe brand thuonghieu_id thuonghieu ngaycapnhat ngaytao')
    .lean({ virtuals: true });

  const byId = new Map((productRows || []).map((item) => [String(item && item._id || ''), item]));
  const orderedRows = favoriteIds.map((id) => byId.get(id)).filter(Boolean);
  if (orderedRows.length === 0) {
    return {
      answer: `Bạn đang có ${favoriteIds.length} mục yêu thích, nhưng hiện chưa có sản phẩm còn bán để hiển thị.`,
      suggestedProducts: [],
      suggestedActions: [{ label: 'Xem yêu thích của tôi', url: '/favorites', kind: 'primary' }],
      contextMeta: buildQuickContextMeta()
    };
  }

  const flashMap = await getActiveFlashSalePriceMap(orderedRows.map((item) => item && item._id));
  const mappedProducts = orderedRows.map((item) => {
    const basePrice = Number(item && item.gia || 0);
    const currentPrice = getCurrentPriceFromRecord(item);
    const finalPrice = applyFlashSaleToCurrentPrice({
      record: item,
      currentPrice,
      flashEntry: flashMap.get(String(item && item._id || ''))
    });

    return {
      id: String(item && item._id || ''),
      tensanpham: String(item && item.tensanpham || 'Sản phẩm'),
      imageUrl: String(item && item.hinhanh || '/images/shopping.png'),
      url: item && item._id ? `/products/${item._id}` : '',
      gia: basePrice,
      giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice,
      brand: item && item.brand,
      thuonghieu_id: item && item.thuonghieu_id,
      thuonghieu: item && item.thuonghieu
    };
  });

  const brandMatches = await findMatchedBrands(question);
  const targetBrand = brandMatches[0] || null;
  const targetBrandIds = brandMatches.map((item) => String(item && item.id || '').trim()).filter(Boolean);
  let selectedProducts = mappedProducts;
  let fallbackBrandProducts = [];

  if (targetBrandIds.length > 0) {
    selectedProducts = mappedProducts.filter((item) => productBelongsToAnyBrand(item, targetBrandIds));
    if (selectedProducts.length === 0) {
      const brandFacet = await getQuickProductsByFacet({ question, priceConstraint: null });
      fallbackBrandProducts = Array.isArray(brandFacet && brandFacet.products) ? brandFacet.products : [];
    }
  }

  const primaryProducts = selectedProducts.length > 0 ? selectedProducts : fallbackBrandProducts;
  const answer = buildQuickFavoritesAnswer({
    totalFavorites: favoriteIds.length,
    selectedProducts: primaryProducts,
    brandMatch: targetBrand
  });

  const suggestedActions = [];
  pushUniqueAction(suggestedActions, { label: 'Xem yêu thích của tôi', url: '/favorites', kind: 'primary' });

  if (targetBrand && targetBrand.id) {
    pushUniqueAction(suggestedActions, {
      label: `Sản phẩm ${targetBrand.label}`,
      url: buildProductsUrl({ brand: targetBrand.id }),
      kind: 'filter'
    });
  }
  if (primaryProducts[0] && primaryProducts[0].url) {
    pushUniqueAction(suggestedActions, { label: 'Xem sản phẩm', url: String(primaryProducts[0].url), kind: 'link' });
  }

  const suggestedProducts = primaryProducts.slice(0, 8).map(toSuggestedCard);

  return {
    answer,
    suggestedProducts,
    suggestedActions: suggestedActions.slice(0, 5),
    contextMeta: buildQuickContextMeta({
      products: primaryProducts.length,
      hasFlashSale: primaryProducts.some((item) => Number(item.giaSauGiam || 0) > 0 && Number(item.gia || 0) > Number(item.giaSauGiam || 0))
    })
  };
}

function buildQuickFacetListingAnswer({
  products,
  typeMatch,
  genderMatch,
  occasionMatches,
  ageGroupMatches,
  brandMatches,
  listUrl
}) {
  const items = Array.isArray(products) ? products.slice(0, 6) : [];
  if (!items.length) return '';

  const filtersText = [];
  if (typeMatch && typeMatch.label) filtersText.push(typeMatch.label);
  if (genderMatch && genderMatch.label) filtersText.push(genderMatch.label);
  if (Array.isArray(occasionMatches) && occasionMatches[0] && occasionMatches[0].label) {
    filtersText.push(`dịp ${occasionMatches[0].label}`);
  }
  if (Array.isArray(ageGroupMatches) && ageGroupMatches[0] && ageGroupMatches[0].label) {
    filtersText.push(`nhóm tuổi ${ageGroupMatches[0].label}`);
  }
  if (Array.isArray(brandMatches) && brandMatches[0] && brandMatches[0].label) {
    filtersText.push(`thương hiệu ${brandMatches[0].label}`);
  }

  const header = filtersText.length > 0
    ? `Mình lọc nhanh theo ${filtersText.join(', ')} và tìm được:`
    : 'Mình lọc nhanh được một số sản phẩm phù hợp:';

  const lines = [header];
  items.forEach((item, index) => {
    const price = Number(item && (item.giaSauGiam || item.gia) || 0);
    const priceText = price > 0 ? `${price.toLocaleString('vi-VN')}đ` : 'Liên hệ';
    const url = String(item && item.url || '').trim();
    lines.push(`${index + 1}. ${item && item.tensanpham ? item.tensanpham : 'Sản phẩm'}: ${priceText}${url ? ` (tại đây: ${url})` : ''}`);
  });

  if (listUrl) {
    lines.push(`Bạn xem thêm danh sách đầy đủ tại đây: ${listUrl}`);
  }

  return lines.join('\n');
}

function buildQuickFacetActions({
  listUrl,
  typeMatch,
  genderMatch,
  occasionMatches,
  ageGroupMatches,
  brandMatches
}) {
  const actions = [];
  if (listUrl) {
    pushUniqueAction(actions, { label: 'Xem sản phẩm phù hợp', url: listUrl, kind: 'primary' });
    pushUniqueAction(actions, { label: 'Tại đây', url: listUrl, kind: 'link' });
  }
  if (typeMatch && typeMatch.label && typeMatch.value) {
    pushUniqueAction(actions, { label: typeMatch.label, url: buildProductsUrl({ loaisanpham: typeMatch.value }), kind: 'filter' });
  }
  if (genderMatch && genderMatch.label && genderMatch.value) {
    pushUniqueAction(actions, { label: genderMatch.label, url: buildProductsUrl({ gioitinh: genderMatch.value }), kind: 'filter' });
  }
  if (Array.isArray(occasionMatches) && occasionMatches[0] && occasionMatches[0].id) {
    pushUniqueAction(actions, { label: occasionMatches[0].label, url: buildProductsUrl({ occasion: occasionMatches[0].id }), kind: 'filter' });
  }
  if (Array.isArray(ageGroupMatches) && ageGroupMatches[0] && ageGroupMatches[0].id) {
    pushUniqueAction(actions, { label: ageGroupMatches[0].label, url: buildProductsUrl({ ageGroup: ageGroupMatches[0].id }), kind: 'filter' });
  }
  if (Array.isArray(brandMatches) && brandMatches[0] && brandMatches[0].id) {
    pushUniqueAction(actions, { label: brandMatches[0].label, url: buildProductsUrl({ brand: brandMatches[0].id }), kind: 'filter' });
  }

  return actions.slice(0, 5);
}

function detectKnowledgeQuickIntent(question) {
  const q = normalizeForCompare(question);
  if (!q) return { lookbook: false, blog: false };
  return {
    lookbook: /\blookbook\b|\bbo suu tap\b/.test(q),
    blog: /\bblog\b|\blofog\b|\bbai viet\b|\btin tuc\b|\bphoi do\b/.test(q)
  };
}

function isLookbookProductQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;
  const hasLookbook = /\blookbook\b|\bbo suu tap\b/.test(q);
  const hasProductNeed = /\bsan pham\b|\bsp\b|\bmau\b|\bitem\b|\btrong\b|\bo\b/.test(q);
  return hasLookbook && hasProductNeed;
}

function scoreLookbookByQuestion(lookbook, question) {
  const title = String(lookbook && lookbook.title || '').trim();
  const slug = String(lookbook && lookbook.slug || '').trim();
  const description = String(lookbook && lookbook.description || '').trim();
  const textNorm = normalizeLooseText(`${title} ${slug} ${description}`);
  const qNorm = normalizeLooseText(question);
  const terms = extractQuickSearchTerms(question).filter((term) => term.length >= 2);
  if (!textNorm) return 0;

  let score = 0;
  const titleNorm = normalizeLooseText(title);
  if (titleNorm && qNorm.includes(titleNorm)) score += 20;
  if (slug && qNorm.includes(normalizeLooseText(slug))) score += 12;

  let matchedTerms = 0;
  terms.forEach((term) => {
    if (textNorm.includes(term)) {
      score += term.length >= 4 ? 5 : 3;
      matchedTerms += 1;
    }
  });
  if (terms.length > 0 && matchedTerms === terms.length) score += 10;

  return score;
}

function pickBestLookbookByQuestion(lookbooks, question) {
  const ranked = (Array.isArray(lookbooks) ? lookbooks : [])
    .map((item) => ({
      item,
      score: scoreLookbookByQuestion(item, question)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0] ? ranked[0].item : null;
}

async function getQuickLookbooks(question) {
  const now = new Date();
  const terms = extractQuickSearchTerms(question);

  const rows = await Lookbook.find({
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
  })
    .select('_id title tenmua slug description mota image hinhanh noiBat isFeatured order thuTu createdAt')
    .sort({ noiBat: -1, isFeatured: -1, order: 1, thuTu: 1, createdAt: -1 })
    .limit(16)
    .lean();

  const mapped = (rows || []).map((item) => {
    const title = String(item && (item.title || item.tenmua) || '').trim();
    const slug = String(item && item.slug || '').trim();
    return {
      title: title || 'Lookbook',
      slug,
      description: String(item && (item.description || item.mota) || '').trim(),
      imageUrl: String(item && (item.image || item.hinhanh) || '/images/shopping.png').trim(),
      url: slug ? `/lookbook/${slug}` : '/lookbook'
    };
  });

  if (terms.length === 0) return mapped.slice(0, 5);
  const matched = mapped.filter((item) => hasAnyQuickSearchTerm(
    `${item.title} ${item.description} ${item.slug}`,
    terms
  ));
  return (matched.length > 0 ? matched : mapped).slice(0, 5);
}

async function getQuickLookbookProducts(question) {
  const now = new Date();
  const rows = await Lookbook.find({
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
  })
    .select('_id title tenmua slug description mota products sanpham_ids noiBat isFeatured order thuTu createdAt')
    .sort({ noiBat: -1, isFeatured: -1, order: 1, thuTu: 1, createdAt: -1 })
    .limit(24)
    .lean();

  const lookbooks = (rows || []).map((item) => {
    const productIdsRaw = Array.isArray(item && item.products) && item.products.length > 0
      ? item.products
      : (Array.isArray(item && item.sanpham_ids) ? item.sanpham_ids : []);
    const productIds = productIdsRaw
      .map((id) => String(id || '').trim())
      .filter(Boolean);

    const title = String(item && (item.title || item.tenmua) || '').trim();
    const slug = String(item && item.slug || '').trim();
    return {
      id: String(item && item._id || '').trim(),
      title: title || 'Lookbook',
      slug,
      description: String(item && (item.description || item.mota) || '').trim(),
      url: slug ? `/lookbook/${slug}` : '/lookbook',
      productIds
    };
  }).filter((item) => item.productIds.length > 0);

  if (lookbooks.length === 0) return null;
  const target = pickBestLookbookByQuestion(lookbooks, question) || lookbooks[0];
  if (!target || !Array.isArray(target.productIds) || target.productIds.length === 0) return null;

  const ids = target.productIds.slice(0, 40);
  const productRows = await Sanpham.find({
    _id: { $in: ids },
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] }
  })
    .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe ngaycapnhat ngaytao')
    .lean({ virtuals: true });

  if (!Array.isArray(productRows) || productRows.length === 0) {
    return {
      lookbook: target,
      products: []
    };
  }

  const flashMap = await getActiveFlashSalePriceMap(productRows.map((item) => item && item._id));
  const byId = new Map(productRows.map((item) => [String(item && item._id || ''), item]));
  const orderedRows = ids.map((id) => byId.get(String(id))).filter(Boolean);

  const products = orderedRows.map((item) => {
    const basePrice = Number(item && item.gia || 0);
    const currentPrice = getCurrentPriceFromRecord(item);
    const finalPrice = applyFlashSaleToCurrentPrice({
      record: item,
      currentPrice,
      flashEntry: flashMap.get(String(item && item._id || ''))
    });

    return {
      id: String(item && item._id || ''),
      tensanpham: String(item && item.tensanpham || 'Sản phẩm'),
      imageUrl: String(item && item.hinhanh || '/images/shopping.png'),
      url: item && item._id ? `/products/${item._id}` : '',
      gia: basePrice,
      giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice
    };
  }).slice(0, 8);

  return {
    lookbook: target,
    products
  };
}

function buildQuickLookbookProductsAnswer(payload) {
  const lookbook = payload && payload.lookbook ? payload.lookbook : null;
  const products = Array.isArray(payload && payload.products) ? payload.products : [];
  if (!lookbook) return '';

  if (!products.length) {
    return [
      `Mình đã tìm thấy lookbook ${lookbook.title}, nhưng hiện chưa có sản phẩm đang bán trong lookbook này.`,
      `Bạn xem lookbook tại đây: ${lookbook.url}`
    ].join('\n');
  }

  const lines = [`Mình tìm thấy một số sản phẩm trong lookbook ${lookbook.title}:`];
  products.slice(0, 6).forEach((item, index) => {
    const price = Number(item && (item.giaSauGiam || item.gia) || 0);
    const priceText = price > 0 ? `${price.toLocaleString('vi-VN')}đ` : 'Liên hệ';
    const url = String(item && item.url || '').trim();
    lines.push(`${index + 1}. ${item && item.tensanpham ? item.tensanpham : 'Sản phẩm'}: ${priceText}${url ? ` (tại đây: ${url})` : ''}`);
  });
  lines.push(`Bạn xem lookbook đầy đủ tại đây: ${lookbook.url}`);
  return lines.join('\n');
}

async function getQuickBlogs(question) {
  const terms = extractQuickSearchTerms(question);
  const rows = await BlogPost.find({ xuatban: true })
    .select('tieude slug tomtat hinhanh noiBat ngayxuatban ngaytao')
    .sort({ noiBat: -1, ngayxuatban: -1, ngaytao: -1 })
    .limit(16)
    .lean();

  const mapped = (rows || []).map((item) => ({
    title: String(item && item.tieude || '').trim() || 'Bài viết',
    slug: String(item && item.slug || '').trim(),
    summary: String(item && item.tomtat || '').trim(),
    imageUrl: String(item && item.hinhanh || '/images/shopping.png').trim(),
    url: item && item.slug ? `/blog/${item.slug}` : '/blog'
  }));

  if (terms.length === 0) return mapped.slice(0, 5);
  const matched = mapped.filter((item) => hasAnyQuickSearchTerm(
    `${item.title} ${item.summary} ${item.slug}`,
    terms
  ));
  return (matched.length > 0 ? matched : mapped).slice(0, 5);
}

function buildQuickKnowledgeAnswer({ lookbooks, blogs }) {
  const lines = [];
  const pickedLookbooks = Array.isArray(lookbooks) ? lookbooks.slice(0, 3) : [];
  const pickedBlogs = Array.isArray(blogs) ? blogs.slice(0, 3) : [];

  if (pickedLookbooks.length > 0) {
    lines.push('Mình tìm nhanh được một số lookbook phù hợp:');
    pickedLookbooks.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title} (tại đây: ${item.url})`);
    });
  }

  if (pickedBlogs.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Bạn có thể tham khảo thêm các bài viết/blog:');
    pickedBlogs.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title} (tại đây: ${item.url})`);
    });
  }

  return lines.join('\n').trim();
}

async function getQuickKnowledgePayload(question) {
  const intent = detectKnowledgeQuickIntent(question);
  if (!intent.lookbook && !intent.blog) return null;

  if (intent.lookbook && isLookbookProductQuestion(question)) {
    const lookbookProducts = await getQuickLookbookProducts(question);
    if (lookbookProducts && lookbookProducts.lookbook) {
      const suggestedActions = [];
      pushUniqueAction(suggestedActions, {
        label: 'Xem lookbook',
        url: String(lookbookProducts.lookbook.url || '/lookbook').trim(),
        kind: 'primary'
      });
      if (lookbookProducts.products[0] && lookbookProducts.products[0].url) {
        pushUniqueAction(suggestedActions, {
          label: 'Xem sản phẩm',
          url: String(lookbookProducts.products[0].url).trim(),
          kind: 'link'
        });
      }

      return {
        answer: buildQuickLookbookProductsAnswer(lookbookProducts),
        suggestedActions: suggestedActions.slice(0, 5),
        suggestedProducts: lookbookProducts.products.map(toSuggestedCard)
      };
    }
  }

  const [lookbooks, blogs] = await Promise.all([
    intent.lookbook ? getQuickLookbooks(question) : Promise.resolve([]),
    intent.blog ? getQuickBlogs(question) : Promise.resolve([])
  ]);

  if ((!lookbooks || lookbooks.length === 0) && (!blogs || blogs.length === 0)) {
    return null;
  }

  const answer = buildQuickKnowledgeAnswer({ lookbooks, blogs });
  if (!answer) return null;

  const suggestedActions = [];
  if (lookbooks.length > 0) {
    pushUniqueAction(suggestedActions, { label: 'Xem lookbook', url: '/lookbook', kind: 'primary' });
    if (lookbooks[0] && lookbooks[0].url) {
      pushUniqueAction(suggestedActions, { label: 'Tại đây', url: lookbooks[0].url, kind: 'link' });
    }
  }
  if (blogs.length > 0) {
    pushUniqueAction(suggestedActions, { label: 'Xem blog', url: '/blog', kind: 'primary' });
    if (blogs[0] && blogs[0].url) {
      pushUniqueAction(suggestedActions, { label: 'Bài viết mới', url: blogs[0].url, kind: 'link' });
    }
  }

  return {
    answer,
    suggestedActions: suggestedActions.slice(0, 5),
    suggestedProducts: []
  };
}

function shouldSuggestProducts(question) {
  const q = String(question || '').toLowerCase();
  if (!q) return false;

  // Only show product cards when user explicitly asks to view/suggest products.
 const includePatterns = [
  /goi\s*y|gợi\s*ý/i,
  /de\s*xuat|đề\s*xuất/i,
  /tu\s*van|tư\s*vấn/i,

  /san\s*pham|sản\s*phẩm/i,
  /xem\s*(san\s*pham|sản\s*phẩm|mau|mẫu)/i,
  /link\s*(san\s*pham|sản\s*phẩm)/i,

  /mau\s*nao|mẫu\s*nào|mau\s*ao|mẫu\s*áo/i,
  /cho\s*toi\s*xem|cho\s*m[iì]nh\s*xem/i,

  /mua\s*(do|đồ|san\s*pham|sản\s*phẩm|ao|áo|quan|quần|vay|váy|tui|túi)/i,

    // Intent-only queries still need product cards
    /di\s*choi|đi\s*chơi/i,
    /di\s*lam|đi\s*làm/i,
    /du\s*tiec|dự\s*tiệc/i,
    /the\s*thao|thể\s*thao/i,
    /o\s*nha|ở\s*nhà/i,
    /tuoi|tuổi|be|bé|tre|trẻ/i,

  // Áo
  /ao|áo|ao\s*thun|áo\s*thun|t\s*shirt|tee/i,
  /hoodie|sweater|ao\s*len|áo\s*len/i,
  /so\s*mi|sơ\s*mi|ao\s*so\s*mi|áo\s*sơ\s*mi/i,
  /ao\s*khoac|áo\s*khoác|jacket|blazer/i,

  // Quần
  /quan|quần|jean|quần\s*jean|denim/i,
  /short|quan\s*short|quần\s*short/i,
  /quan\s*tay|quần\s*tây|trouser/i,
  /jogger|quan\s*jogger|quần\s*jogger/i,

  // Váy / đầm
  /vay|váy|dam|đầm/i,
  /chan\s*vay|chân\s*váy|skirt/i,
  /maxi|vay\s*maxi|váy\s*maxi/i,

  // Phụ kiện
  /tui|túi|tui\s*xach|túi\s*xách|bag/i,
  /that\s*lung|thắt\s*lưng|belt/i,
  /mu|mũ|non|nón|cap|hat/i,
  /khan\s*choang|khăn\s*choàng|scarf/i,

  // Giày dép
  /giay|giày|sneaker/i,
  /dep|dép|sandal/i,
  /boot|boots/i
];

  return includePatterns.some((pattern) => pattern.test(q));
}

function extractMentionedProductIds(text) {
  const ids = new Set();
  const str = String(text || '');
  const regex = /\b([a-f0-9]{24})\b/gi;
  let match = regex.exec(str);
  while (match) {
    ids.add(String(match[1] || '').toLowerCase());
    match = regex.exec(str);
  }
  return ids;
}

function extractRequestedColor(question) {
  const q = normalizeForCompare(question);
  if (!q) return '';
  const colors = ['hong', 'xanh', 'xanh la', 'trang', 'den', 'do', 'vang', 'tim', 'cam', 'nau', 'be', 'xam'];
  for (const color of colors) {
    if (q.includes(color)) return color;
  }
  return '';
}

function normalizeColor(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerHasNegativeAvailability(answer) {
  const t = normalizeForCompare(answer);
  return /khong co|chua co|het hang|khong tim thay/.test(t);
}

function isProductFilterQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;

  return /tuoi|be|tre|thuong hieu|brand|dip|di choi|di lam|du tiec|the thao|o nha/.test(q);
}

function buildAvailableProductsAnswer(context, question) {
  const products = Array.isArray(context && context.products) && context.products.length
    ? context.products
    : (Array.isArray(context && context.topSelling) ? context.topSelling : []);
  if (!products.length) return '';

  const picked = products.slice(0, 3);
  const lines = [
    'Shop hiện có sản phẩm phù hợp với nhu cầu bạn hỏi. Bạn tham khảo nhanh:'
  ];

  picked.forEach((item, index) => {
    const name = String(item && item.tensanpham ? item.tensanpham : 'Sản phẩm');
    const finalPrice = Number(item && (item.giaSauGiam || item.gia) || 0);
    const priceText = finalPrice > 0 ? ` - ${finalPrice.toLocaleString('vi-VN')}đ` : '';
    const url = item && item.url ? ` (${item.url})` : '';
    lines.push(`${index + 1}. ${name}${priceText}${url}`);
  });

  if (isProductFilterQuestion(question)) {
    lines.push('Bạn muốn mình lọc hẹp hơn theo thương hiệu, dịp hoặc nhóm tuổi cụ thể không?');
  }

  return lines.join('\n');
}

function sanitizeBadLinksInAnswer(answer) {
  let text = String(answer || '').trim();
  if (!text) return text;

  // Replace malformed/placeholder domains with internal routes.
  text = text
    .replace(/-?\s*(?:https?:\/\/)?(?:www\.)?ban-thoi-trang\.com\/(new|best-selling|san-pham|sanpham|products?)\b/gi, '/products')
    .replace(/-?\s*(?:https?:\/\/)?(?:www\.)?(?:website|example\.com|localhost(?::\d+)?)\/(new|best-selling|san-pham|sanpham|products?)\b/gi, '/products')
    .replace(/\((?:https?:\/\/)?(?:www\.)?ban-thoi-trang\.com\/[^\)]*\)/gi, '(/products)')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?ban-thoi-trang\.com\/[^\s)]*/gi, '/products')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?(?:website|example\.com|localhost(?::\d+)?)\/[^\s)]*/gi, '/products');

  // Never expose random external links in the client chat bubble.
  text = text.replace(/\bhttps?:\/\/[^\s)]+/gi, '');
  text = text.replace(/\[(.*?)\]\(\s*\)/g, '$1');
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text;
}

function buildAvailableSuggestedAnswer(suggestedProducts) {
  const items = Array.isArray(suggestedProducts) ? suggestedProducts.slice(0, 3) : [];
  if (!items.length) return '';

  const lines = ['Shop hiện có sản phẩm phù hợp, bạn xem nhanh:'];
  items.forEach((item, index) => {
    const name = String(item && item.name ? item.name : 'Sản phẩm');
    const price = Number(item && item.price || 0);
    const priceText = price > 0 ? ` - ${price.toLocaleString('vi-VN')}đ` : '';
    const url = item && item.url ? ` (${item.url})` : '';
    lines.push(`${index + 1}. ${name}${priceText}${url}`);
  });
  lines.push('Bạn muốn mình lọc chính xác hơn theo tuổi, dịp hoặc thương hiệu không?');
  return lines.join('\n');
}

function findProductsByRequestedColor(context, requestedColor) {
  if (!requestedColor) return [];
  const products = Array.isArray(context && context.products) ? context.products : [];

  return products
    .map((p) => {
      const colorDetails = Array.isArray(p && p.mauSacChiTiet) ? p.mauSacChiTiet : [];
      const matchedDetails = colorDetails.filter((c) => normalizeColor(c && c.ten).includes(requestedColor));
      const matchedAny = matchedDetails.length > 0;
      const hasSizeInMatchedColor = matchedDetails.some((c) => Boolean(c && c.conSize));

      return {
        product: p,
        matchedAny,
        hasSizeInMatchedColor
      };
    })
    .filter((x) => x.matchedAny);
}

function buildColorAvailabilityAnswer(context, requestedColor) {
  const matches = findProductsByRequestedColor(context, requestedColor);
  if (!matches.length) return '';

  const available = matches.filter((m) => m.hasSizeInMatchedColor).slice(0, 3);
  const unavailable = matches.filter((m) => !m.hasSizeInMatchedColor).slice(0, 3);

  const lines = [];
  if (available.length) {
    lines.push('Shop có màu bạn cần. Bạn tham khảo nhanh:');
    available.forEach((m, idx) => {
      const p = m.product || {};
      const price = Number(p.giaSauGiam || p.gia || 0);
      lines.push(`${idx + 1}. ${p.tensanpham || 'Sản phẩm'}${price > 0 ? ` - ${price.toLocaleString('vi-VN')}đ` : ''}${p.url ? ` (${p.url})` : ''}`);
    });
  }

  if (!available.length && unavailable.length) {
    lines.push('Shop có màu bạn hỏi nhưng hiện màu này đang hết size để đặt hàng.');
  }

  if (available.length && unavailable.length) {
    lines.push('Một số mẫu khác có màu này hiện đang hết size.');
  }

  lines.push('Bạn muốn mình lọc thêm theo size còn hàng hoặc màu gần giống không?');
  return lines.join('\n');
}

function detectRequestedGroups(question) {
  const q = normalizeForCompare(question);
  if (!q) return [];

  const groups = [];
  if (/(\bnon\b|\bmu\b|\bhat\b|\bcap\b)/.test(q)) groups.push('hat');
  if (/(\bao\b|\bpolo\b|\bthun\b|\bso mi\b|\bkhoac\b|\bhoodie\b|\bblazer\b|\bshirt\b)/.test(q)) groups.push('top');
  if (/(\bquan\b|\bjean\b|\bshort\b|\bjogger\b|\btrouser\b|\bpant\b)/.test(q)) groups.push('bottom');

  return groups;
}

function productMatchesGroup(product, group) {
  const text = normalizeForCompare(`${product && product.name ? product.name : ''} ${product && product.url ? product.url : ''}`);
  if (!text) return false;

  if (group === 'hat') return /(\bnon\b|\bmu\b|\bhat\b|\bcap\b)/.test(text);
  if (group === 'top') return /(\bao\b|\bpolo\b|\bthun\b|\bso mi\b|\bkhoac\b|\bhoodie\b|\bblazer\b|\bshirt\b)/.test(text);
  if (group === 'bottom') return /(\bquan\b|\bjean\b|\bshort\b|\bjogger\b|\btrouser\b|\bpant\b)/.test(text);
  return false;
}

function toSuggestedProducts(context, answerText, questionText) {
  const byId = new Map();

  const push = (item) => {
    if (!item) return;
    const id = String(item.id || '').trim();
    if (!id || byId.has(id)) return;
    const finalPrice = Number(item.giaSauGiam || item.gia || 0);
    const originalPrice = Number(item.gia || 0);
    const hasDiscount = originalPrice > 0 && finalPrice > 0 && finalPrice < originalPrice;
    byId.set(id, {
      id,
      name: String(item.tensanpham || 'Sản phẩm'),
      url: String(item.url || `/products/${id}`),
      imageUrl: String(item.imageUrl || '/images/shopping.png'),
      price: finalPrice,
      originalPrice,
      hasDiscount,
      priceText: finalPrice > 0 ? `${finalPrice.toLocaleString('vi-VN')}đ` : '',
      originalPriceText: hasDiscount ? `${originalPrice.toLocaleString('vi-VN')}đ` : ''
    });
  };

  // Suggest from both contextual search results and top-selling products.
  (Array.isArray(context.products) ? context.products : []).forEach(push);
  (Array.isArray(context.topSelling) ? context.topSelling : []).forEach(push);
  (Array.isArray(context.lookbooks) ? context.lookbooks : []).forEach((lookbook) => {
    (Array.isArray(lookbook && lookbook.products) ? lookbook.products : []).forEach(push);
  });
  const priceConstraint = extractPriceConstraint(questionText);
  const candidates = Array.from(byId.values()).filter((item) => matchPriceConstraint(item.price, priceConstraint));
  if (candidates.length === 0) return [];

  const answerNorm = normalizeForCompare(answerText);
  if (!answerNorm) return candidates.slice(0, 4);

  const mentionedIds = extractMentionedProductIds(answerText);
  const byMentionedId = candidates.filter((item) => mentionedIds.has(String(item.id || '').toLowerCase()));
  if (byMentionedId.length > 0) return byMentionedId.slice(0, 4);

  const matched = candidates.filter((item) => {
    const nameNorm = normalizeForCompare(item.name);
    if (!nameNorm) return false;
    if (answerNorm.includes(nameNorm)) return true;

    const tokens = nameNorm.split(' ').filter((token) => token.length >= 4);
    if (tokens.length === 0) return false;
    return tokens.some((token) => answerNorm.includes(token));
  });

  const baseList = matched.length > 0 ? matched : candidates;

  const requestedGroups = detectRequestedGroups(questionText);
  if (requestedGroups.length === 0) {
    return baseList.slice(0, 4);
  }

  const selected = [];
  const selectedIds = new Set();
  const take = (item) => {
    if (!item) return;
    const id = String(item.id || '');
    if (!id || selectedIds.has(id)) return;
    selected.push(item);
    selectedIds.add(id);
  };

  // Ensure each requested outfit group has at least one representative if available.
  requestedGroups.forEach((group) => {
    const first = baseList.find((item) => productMatchesGroup(item, group));
    take(first);
  });

  baseList.forEach(take);
  return selected.slice(0, 4);
}

function extractOrderCodes(message) {
  const text = String(message || '').toUpperCase();
  if (!text) return [];
  const matches = text.match(/\bDH\d{8,}\b/g) || [];
  return Array.from(new Set(matches));
}

function getOrderStatusLabel(status) {
  const map = {
    choxacnhan: 'Chờ xác nhận',
    daxacnhan: 'Đã xác nhận',
    dangchuanbi: 'Đang chuẩn bị',
    danggiao: 'Đang giao',
    dagiao: 'Đã giao',
    requested_return: 'Yêu cầu hoàn hàng',
    approved_return: 'Đã duyệt hoàn hàng',
    rejected_return: 'Từ chối hoàn hàng',
    return_shipping: 'Đang gửi hàng hoàn',
    returned: 'Đã nhận hàng hoàn',
    refunded: 'Đã hoàn tiền',
    yeucau_hoanhang: 'Yêu cầu hoàn hàng',
    daduyet_hoanhang: 'Đã duyệt hoàn hàng',
    tuchoi_hoanhang: 'Từ chối hoàn hàng',
    danggui_hanghoan: 'Đang gửi hàng hoàn',
    danhan_hanghoan: 'Đã nhận hàng hoàn',
    dahoantien: 'Đã hoàn tiền',
    dahuy: 'Đã hủy',
    hoanhang: 'Hoàn hàng'
  };
  return map[String(status || '').toLowerCase()] || String(status || 'Không rõ');
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function buildExactOrderAnswer(orderCode, myOrders) {
  const codes = extractOrderCodes(orderCode);
  if (!myOrders || !Array.isArray(myOrders.matchedOrders) || codes.length === 0) return null;

  const orderMap = new Map((myOrders.matchedOrders || [])
    .filter((item) => item && item.madonhang)
    .map((item) => [String(item.madonhang || '').toUpperCase(), item]));

  const targetCode = codes[0];
  const target = orderMap.get(targetCode);
  if (!target) {
    return {
      answer: `Mình không tìm thấy đơn ${targetCode} trong tài khoản của bạn. Bạn vui lòng kiểm tra lại mã đơn hoặc vào trang /orders để xem danh sách đơn hiện có.`
    };
  }

  const created = target.ngaytao ? new Date(target.ngaytao).toLocaleString('vi-VN') : 'Không rõ';
  const statusLabel = getOrderStatusLabel(target.trangthai);
  const reasonText = target.trangthai === 'dahuy' && target.lydohuy
    ? `\n- Lý do hủy: ${String(target.lydohuy).trim()}`
    : '';

  return {
    answer: [
      `📌 Thông tin đơn ${targetCode}`,
      `- Trạng thái: ${statusLabel}`,
      `- Tổng tiền: ${formatMoney(target.tongtien)}`,
      `- Ngày tạo: ${created}`,
      `- Phương thức thanh toán: ${target.phuongthucthanhtoan || 'Không rõ'}`,
      reasonText
    ].filter(Boolean).join('\n')
  };
}

module.exports.sendMessage = async (req, res) => {
  try {
    const question = normalizeMessage(req.body && req.body.message);
    const history = Array.isArray(req.body && req.body.history) ? req.body.history : [];
    const provider = normalizeMessage(req.body && req.body.provider).toLowerCase() || 'ollama';
    const model = normalizeMessage(req.body && req.body.model);
    const imageProducts = normalizeClientImageProducts(req.body && req.body.imageProducts);
    const imageMeta = req.body && typeof req.body.imageMeta === 'object' ? req.body.imageMeta : null;

    if (!question) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập câu hỏi' });
    }

    if (question.length > 1200) {
      return res.status(400).json({ success: false, message: 'Câu hỏi quá dài (tối đa 1200 ký tự)' });
    }

    if (isAdminRelatedQuestion(question)) {
      return res.json({
        success: true,
        data: {
          answer: buildAdminRestrictionAnswer(),
          model: 'policy-guard',
          provider: 'system',
          suggestedProducts: [],
          contextMeta: {
            products: 0,
            hasFlashSale: false,
            vouchers: 0,
            sizeGuides: 0,
            topSelling: 0,
            topRated: 0,
            openClipUsed: false,
            openClipModel: '',
            reviewsRecent: 0,
            reviewsMine: 0,
            settings: 0,
            myOrders: 0,
            myVouchers: 0
          }
        }
      });
    }

    const fastDirectPriceLookup = await findDirectPriceMatchFast(question);
    if (fastDirectPriceLookup.isSpecific) {
      if (fastDirectPriceLookup.product) {
        const product = fastDirectPriceLookup.product;
        return res.json({
          success: true,
          data: {
            answer: buildDirectPriceAnswer(product),
            model: 'db-fast-path',
            provider: 'system',
            suggestedProducts: [product],
            suggestedActions: [{
              label: 'Xem sản phẩm',
              url: String(product.url || `/products/${product.id || ''}`).trim(),
              kind: 'primary'
            }],
            contextMeta: {
              products: 1,
              hasFlashSale: Number(product.giaSauGiam || 0) > 0 && Number(product.gia || 0) > Number(product.giaSauGiam || 0),
              vouchers: 0,
              sizeGuides: 0,
              topSelling: 0,
              topRated: 0,
              openClipUsed: false,
              openClipModel: '',
              reviewsRecent: 0,
              reviewsMine: 0,
              settings: 0,
              myOrders: 0,
              myVouchers: 0
            }
          }
        });
      }
    }

    const quickFavorites = await getQuickFavoritesPayload({
      userId: req.user && req.user._id ? req.user._id : null,
      question
    });
    if (quickFavorites && quickFavorites.answer) {
      return res.json({
        success: true,
        data: {
          answer: quickFavorites.answer,
          model: 'db-fast-path',
          provider: 'system',
          suggestedProducts: Array.isArray(quickFavorites.suggestedProducts) ? quickFavorites.suggestedProducts : [],
          suggestedActions: Array.isArray(quickFavorites.suggestedActions) ? quickFavorites.suggestedActions : [],
          contextMeta: quickFavorites.contextMeta || buildQuickContextMeta()
        }
      });
    }

    const quickBrands = await getQuickBrandListingPayload(question);
    if (quickBrands && quickBrands.answer) {
      return res.json({
        success: true,
        data: {
          answer: quickBrands.answer,
          model: 'db-fast-path',
          provider: 'system',
          suggestedProducts: [],
          suggestedActions: Array.isArray(quickBrands.suggestedActions) ? quickBrands.suggestedActions : [],
          contextMeta: quickBrands.contextMeta || buildQuickContextMeta()
        }
      });
    }

    const quickKnowledge = await getQuickKnowledgePayload(question);
    if (quickKnowledge && quickKnowledge.answer) {
      return res.json({
        success: true,
        data: {
          answer: quickKnowledge.answer,
          model: 'db-fast-path',
          provider: 'system',
          suggestedProducts: Array.isArray(quickKnowledge.suggestedProducts) ? quickKnowledge.suggestedProducts : [],
          suggestedActions: Array.isArray(quickKnowledge.suggestedActions) ? quickKnowledge.suggestedActions : [],
          contextMeta: buildQuickContextMeta()
        }
      });
    }

    const priceConstraint = extractPriceConstraint(question);

    if (isFacetListingQuestion(question)) {
      const facetResult = await getQuickProductsByFacet({ question, priceConstraint });
      if (Array.isArray(facetResult.products) && facetResult.products.length > 0) {
        const urlFilters = buildFacetFiltersForUrl({
          typeMatch: facetResult.typeMatch,
          genderMatch: facetResult.genderMatch,
          brandMatches: facetResult.brandMatches,
          occasionMatches: facetResult.occasionMatches,
          ageGroupMatches: facetResult.ageGroupMatches,
          priceConstraint
        });
        const listUrl = buildProductsUrl(urlFilters);
        return res.json({
          success: true,
          data: {
            answer: buildQuickFacetListingAnswer({
              products: facetResult.products,
              typeMatch: facetResult.typeMatch,
              genderMatch: facetResult.genderMatch,
              occasionMatches: facetResult.occasionMatches,
              ageGroupMatches: facetResult.ageGroupMatches,
              brandMatches: facetResult.brandMatches,
              listUrl
            }),
            model: 'db-fast-path',
            provider: 'system',
            suggestedProducts: facetResult.products.map(toSuggestedCard),
            suggestedActions: buildQuickFacetActions({
              listUrl,
              typeMatch: facetResult.typeMatch,
              genderMatch: facetResult.genderMatch,
              occasionMatches: facetResult.occasionMatches,
              ageGroupMatches: facetResult.ageGroupMatches,
              brandMatches: facetResult.brandMatches
            }),
            contextMeta: buildQuickContextMeta({
              products: facetResult.products.length,
              hasFlashSale: facetResult.products.some((item) => Number(item.giaSauGiam || 0) > 0 && Number(item.gia || 0) > Number(item.giaSauGiam || 0))
            })
          }
        });
      }
    }
    if (isPriceListingQuestion(question, priceConstraint)) {
      const quickProducts = await getQuickProductsByPriceConstraint(priceConstraint);
      if (quickProducts.length > 0) {
        const listUrl = buildPriceListUrlFromConstraint(priceConstraint);
        return res.json({
          success: true,
          data: {
            answer: buildQuickPriceListingAnswer(quickProducts, priceConstraint),
            model: 'db-fast-path',
            provider: 'system',
            suggestedProducts: quickProducts.map(toSuggestedCard),
            suggestedActions: [
              { label: 'Xem sản phẩm phù hợp', url: listUrl, kind: 'primary' },
              { label: 'Tại đây', url: listUrl, kind: 'link' }
            ],
            contextMeta: {
              products: quickProducts.length,
              hasFlashSale: quickProducts.some((item) => Number(item.giaSauGiam || 0) > 0 && Number(item.gia || 0) > Number(item.giaSauGiam || 0)),
              vouchers: 0,
              sizeGuides: 0,
              topSelling: 0,
              topRated: 0,
              openClipUsed: false,
              openClipModel: '',
              reviewsRecent: 0,
              reviewsMine: 0,
              settings: 0,
              myOrders: 0,
              myVouchers: 0
            }
          }
        });
      }
    }

    const shouldUseSemanticProductSearch = provider === 'openclip' || shouldSuggestProducts(question);

    const context = await buildDataContext({
      question,
      userId: req.user && req.user._id ? req.user._id : null,
      useOpenClip: shouldUseSemanticProductSearch
    });

    mergeImageProductsIntoContext(context, imageProducts, imageMeta, question);

    if (priceConstraint) {
      context.products = applyPriceConstraintToProducts(context.products, priceConstraint).slice(0, 6);
      context.topSelling = applyPriceConstraintToProducts(context.topSelling, priceConstraint).slice(0, 8);
    }

    const exactOrder = buildExactOrderAnswer(question, context && context.myOrders);
    if (exactOrder) {
      const suggestedActions = await buildSuggestedActions({
        question,
        context,
        exactOrder
      });
      return res.json({
        success: true,
        data: {
          answer: exactOrder.answer,
          model: 'db-verified',
          provider: 'system',
          suggestedProducts: [],
          suggestedActions,
          contextMeta: {
            products: Array.isArray(context.products) ? context.products.length : 0,
            hasFlashSale: Boolean(context.flashSale),
            vouchers: Array.isArray(context.vouchers) ? context.vouchers.length : 0,
            sizeGuides: Array.isArray(context.sizeGuides) ? context.sizeGuides.length : 0,
            topSelling: Array.isArray(context.topSelling) ? context.topSelling.length : 0,
            topRated: Array.isArray(context.topRated) ? context.topRated.length : 0,
            reviewsRecent: context.reviews && Array.isArray(context.reviews.recent) ? context.reviews.recent.length : 0,
            reviewsMine: context.reviews && Array.isArray(context.reviews.mine) ? context.reviews.mine.length : 0,
            settings: Array.isArray(context.settings) ? context.settings.length : 0,
            myOrders: context.myOrders ? Number(context.myOrders.totalOrders || 0) : 0,
            myVouchers: context.myVouchers ? Number(context.myVouchers.totalSaved || 0) : 0,
            matchedOrders: context.myOrders && Array.isArray(context.myOrders.matchedOrders)
              ? context.myOrders.matchedOrders.length
              : 0
          }
        }
      });
    }

    const directPriceLookup = findDirectPriceMatchInContext(question, context);
    if (directPriceLookup.isSpecific) {
      const suggestedActions = await buildSuggestedActions({
        question,
        context
      });

      if (directPriceLookup.product) {
        pushUniqueAction(suggestedActions, {
          label: 'Xem sản phẩm',
          url: String(directPriceLookup.product.url || `/products/${directPriceLookup.product.id || ''}`).trim(),
          kind: 'primary'
        });

        return res.json({
          success: true,
          data: {
            answer: buildDirectPriceAnswer(directPriceLookup.product),
            model: 'db-verified',
            provider: 'system',
            suggestedProducts: toSuggestedProducts(
              { products: [directPriceLookup.product] },
              String(directPriceLookup.product.tensanpham || ''),
              question
            ),
            suggestedActions,
            contextMeta: {
              products: Array.isArray(context.products) ? context.products.length : 0,
              hasFlashSale: Boolean(context.flashSale),
              vouchers: Array.isArray(context.vouchers) ? context.vouchers.length : 0,
              sizeGuides: Array.isArray(context.sizeGuides) ? context.sizeGuides.length : 0,
              topSelling: Array.isArray(context.topSelling) ? context.topSelling.length : 0,
              topRated: Array.isArray(context.topRated) ? context.topRated.length : 0,
              reviewsRecent: context.reviews && Array.isArray(context.reviews.recent) ? context.reviews.recent.length : 0,
              reviewsMine: context.reviews && Array.isArray(context.reviews.mine) ? context.reviews.mine.length : 0,
              settings: Array.isArray(context.settings) ? context.settings.length : 0,
              myOrders: context.myOrders ? Number(context.myOrders.totalOrders || 0) : 0,
              myVouchers: context.myVouchers ? Number(context.myVouchers.totalSaved || 0) : 0
            }
          }
        });
      }

      const strictFinalLookup = await findDirectPriceMatchFast(question);
      if (strictFinalLookup && strictFinalLookup.product) {
        const product = strictFinalLookup.product;
        return res.json({
          success: true,
          data: {
            answer: buildDirectPriceAnswer(product),
            model: 'db-verified',
            provider: 'system',
            suggestedProducts: [product],
            suggestedActions,
            contextMeta: {
              products: Array.isArray(context.products) ? context.products.length : 0,
              hasFlashSale: Boolean(context.flashSale),
              vouchers: Array.isArray(context.vouchers) ? context.vouchers.length : 0,
              sizeGuides: Array.isArray(context.sizeGuides) ? context.sizeGuides.length : 0,
              topSelling: Array.isArray(context.topSelling) ? context.topSelling.length : 0,
              topRated: Array.isArray(context.topRated) ? context.topRated.length : 0,
              reviewsRecent: context.reviews && Array.isArray(context.reviews.recent) ? context.reviews.recent.length : 0,
              reviewsMine: context.reviews && Array.isArray(context.reviews.mine) ? context.reviews.mine.length : 0,
              settings: Array.isArray(context.settings) ? context.settings.length : 0,
              myOrders: context.myOrders ? Number(context.myOrders.totalOrders || 0) : 0,
              myVouchers: context.myVouchers ? Number(context.myVouchers.totalSaved || 0) : 0
            }
          }
        });
      }

      pushUniqueAction(suggestedActions, {
        label: 'Tìm sản phẩm',
        url: buildProductsUrl({
          keyword: (directPriceLookup.lookupTerms || []).join(' ')
        }),
        kind: 'primary'
      });

      return res.json({
        success: true,
        data: {
          answer: buildSpecificProductNotFoundAnswer(directPriceLookup.lookupTerms),
          model: 'db-verified',
          provider: 'system',
          suggestedProducts: [],
          suggestedActions,
          contextMeta: {
            products: Array.isArray(context.products) ? context.products.length : 0,
            hasFlashSale: Boolean(context.flashSale),
            vouchers: Array.isArray(context.vouchers) ? context.vouchers.length : 0,
            sizeGuides: Array.isArray(context.sizeGuides) ? context.sizeGuides.length : 0,
            topSelling: Array.isArray(context.topSelling) ? context.topSelling.length : 0,
            topRated: Array.isArray(context.topRated) ? context.topRated.length : 0,
            reviewsRecent: context.reviews && Array.isArray(context.reviews.recent) ? context.reviews.recent.length : 0,
            reviewsMine: context.reviews && Array.isArray(context.reviews.mine) ? context.reviews.mine.length : 0,
            settings: Array.isArray(context.settings) ? context.settings.length : 0,
            myOrders: context.myOrders ? Number(context.myOrders.totalOrders || 0) : 0,
            myVouchers: context.myVouchers ? Number(context.myVouchers.totalSaved || 0) : 0
          }
        }
      });
    }

    const ai = await askAI({ question, history, context, provider, model });

    let answer = String(ai && ai.content ? ai.content : '').trim();
    const requestedColor = extractRequestedColor(question);
    answer = sanitizeBadLinksInAnswer(answer);

    if (requestedColor && answerHasNegativeAvailability(answer)) {
      const corrected = buildColorAvailabilityAnswer(context, requestedColor);
      if (corrected) answer = corrected;
    }

    if (answerHasNegativeAvailability(answer)) {
      const corrected = buildAvailableProductsAnswer(context, question);
      if (corrected) answer = corrected;
    }

    const fallbackSuggestedProducts = toSuggestedProducts(context, '', question);
    if (answerHasNegativeAvailability(answer) && fallbackSuggestedProducts.length > 0) {
      const corrected = buildAvailableSuggestedAnswer(fallbackSuggestedProducts);
      if (corrected) answer = corrected;
    }

    const hasLookbookProducts = Array.isArray(context.lookbooks)
      && context.lookbooks.some((lookbook) => Array.isArray(lookbook && lookbook.products) && lookbook.products.length > 0);
    const shouldShowCards = shouldUseSemanticProductSearch || hasLookbookProducts;
    const suggestedProducts = shouldShowCards
      ? toSuggestedProducts(context, answer, question)
      : [];

    if (answerHasNegativeAvailability(answer) && suggestedProducts.length > 0) {
      const corrected = buildAvailableSuggestedAnswer(suggestedProducts);
      if (corrected) answer = corrected;
    }

    answer = sanitizeBadLinksInAnswer(answer);
    const suggestedActions = await buildSuggestedActions({
      question,
      context
    });

    return res.json({
      success: true,
      data: {
        answer,
        model: ai.model,
        provider: ai.provider || provider,
        suggestedProducts,
        suggestedActions,
        contextMeta: {
          products: Array.isArray(context.products) ? context.products.length : 0,
          hasFlashSale: Boolean(context.flashSale),
          vouchers: Array.isArray(context.vouchers) ? context.vouchers.length : 0,
          sizeGuides: Array.isArray(context.sizeGuides) ? context.sizeGuides.length : 0,
          topSelling: Array.isArray(context.topSelling) ? context.topSelling.length : 0,
          topRated: Array.isArray(context.topRated) ? context.topRated.length : 0,
          openClipUsed: Boolean(context.openClip && context.openClip.used),
          openClipModel: context.openClip && context.openClip.model ? context.openClip.model : '',
          reviewsRecent: context.reviews && Array.isArray(context.reviews.recent) ? context.reviews.recent.length : 0,
          reviewsMine: context.reviews && Array.isArray(context.reviews.mine) ? context.reviews.mine.length : 0,
          settings: Array.isArray(context.settings) ? context.settings.length : 0,
          myOrders: context.myOrders ? Number(context.myOrders.totalOrders || 0) : 0,
          myVouchers: context.myVouchers ? Number(context.myVouchers.totalSaved || 0) : 0
        }
      }
    });
  } catch (error) {
    const msg = String(error && error.message ? error.message : 'Lỗi không xác định');
    const selectedProvider = normalizeMessage(req.body && req.body.provider).toLowerCase() || 'ollama';
    if (msg.includes('GEMINI_API_KEY_MISSING')) {
      return res.status(503).json({
        success: false,
        message: 'Chưa cấu hình Gemini API key. Vui lòng thêm GEMINI_API_KEY trong .env.'
      });
    }

    if (msg.includes('OPENROUTER_API_KEY_MISSING')) {
      return res.status(503).json({
        success: false,
        message: 'Chưa cấu hình OpenRouter API key. Vui lòng thêm OPENROUTER_API_KEY trong .env.'
      });
    }

    if (msg.toLowerCase().includes('developer instruction is not enabled')) {
      return res.status(503).json({
        success: false,
        message: 'Model Gemini hiện tại chưa được bật cho API key này. Hệ thống sẽ ưu tiên dùng gemini-2.5-flash nếu có thể.'
      });
    }

    const lower = msg.toLowerCase();
    if (lower.includes('high demand') || lower.includes('try again later')) {
      return res.status(503).json({
        success: false,
        message: 'Model Gemini đang quá tải tạm thời. Vui lòng thử lại sau vài giây.'
      });
    }

    const isConnectionError = lower.includes('fetch failed')
      || lower.includes('econnrefused')
      || lower.includes('abort')
      || lower.includes('timed out')
      || lower.includes('timeout');

    if (isConnectionError) {
      if (selectedProvider === 'gemini') {
        return res.status(503).json({
          success: false,
          message: 'Không kết nối được Gemini hoặc phản hồi quá chậm. Vui lòng thử lại sau ít giây.'
        });
      }

      if (selectedProvider === 'openrouter') {
        return res.status(503).json({
          success: false,
          message: 'Không kết nối được OpenRouter hoặc phản hồi quá chậm. Vui lòng thử lại sau ít giây.'
        });
      }

      return res.status(503).json({
        success: false,
        message: 'Không kết nối được Ollama. Hãy bật Ollama và pull model trước khi chat.'
      });
    }

    if (msg.includes('OLLAMA_MEMORY_INSUFFICIENT') || lower.includes('requires more system memory')) {
      return res.status(503).json({
        success: false,
        message: 'Model Ollama hiện tại cần nhiều RAM hơn máy đang có. Vui lòng đổi model nhẹ hơn (ví dụ gemma3:1b hoặc gemma2:2b), hoặc chọn Gemini/OpenRouter.'
      });
    }

    console.error('AI chat error:', error);
    return res.status(500).json({ success: false, message: 'Không thể xử lý câu hỏi lúc này' });
  }
};

module.exports.searchOpenClip = async (req, res) => {
  try {
    const query = normalizeMessage(req.body && req.body.query);
    if (!query) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mô tả sản phẩm' });
    }

    if (query.length > 500) {
      return res.status(400).json({ success: false, message: 'Mô tả quá dài (tối đa 500 ký tự)' });
    }

    const rows = await Sanpham.find({
      daxoa: { $ne: true },
      trangthai: { $in: ['active', 'dangban'] },
      hinhanh: { $exists: true, $ne: '' }
    })
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(280)
      .lean({ virtuals: true });

    const products = (rows || []).map((item) => {
      const basePrice = Number(item.gia || 0);
      const percent = Number(item.phantramgiamgia || 0);
      const currentPrice = getCurrentPriceFromRecord(item);
      return {
        id: String(item._id || ''),
        tensanpham: String(item.tensanpham || 'Sản phẩm'),
        imageUrl: String(item.hinhanh || '/images/shopping.png'),
        url: item._id ? `/products/${item._id}` : '',
        gia: basePrice,
        giaSauGiam: currentPrice,
        phantramgiamgia: percent,
        soluongton: Number(item.soluongton || 0),
        gioitinh: String(item.gioitinh || ''),
        loaisanpham: String(item.loaisanpham || ''),
        openClipScore: 0
      };
    });

    const ranked = await rankProductsByQuery({
      query,
      products,
      topK: Math.max(8, OPENCLIP_RESULT_TOP_K)
    });

    const limitedProducts = Array.isArray(ranked.matches)
      ? ranked.matches.slice(0, Math.max(1, OPENCLIP_UI_MAX_RESULTS))
      : [];

    return res.json({
      success: true,
      data: {
        query,
        products: limitedProducts,
        openClipMeta: {
          used: Boolean(ranked.used),
          model: ranked.meta && ranked.meta.model ? ranked.meta.model : '',
          pretrained: ranked.meta && ranked.meta.pretrained ? ranked.meta.pretrained : '',
          device: ranked.meta && ranked.meta.device ? ranked.meta.device : '',
          candidates: Number(ranked.meta && ranked.meta.candidates ? ranked.meta.candidates : 0)
        }
      }
    });
  } catch (error) {
    console.error('OpenCLIP search error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tìm kiếm OpenCLIP lúc này' });
  }
};

module.exports.searchOpenClipByImage = async (req, res) => {
  const uploadedPath = req.file && req.file.path ? String(req.file.path) : '';
  try {
    if (!uploadedPath) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh để tìm kiếm' });
    }

    const requestedType = String(req.body && req.body.loaisanpham || '').trim().toLowerCase();
    const inferredTypeFromQuery = (() => {
      const inferred = inferProductType(normalizeMessage(req.body && req.body.query));
      const value = String(inferred && inferred.value || '').trim().toLowerCase();
      return ALLOWED_PRODUCT_TYPES.has(value) ? value : '';
    })();
    const manualType = ALLOWED_PRODUCT_TYPES.has(requestedType) ? requestedType : inferredTypeFromQuery;

    let detectedType = '';
    let confidentDetectedType = '';
    let detectMeta = null;

    if (!manualType) {
      try {
        const detected = await classifyImageCategory({
          imagePath: uploadedPath,
          labels: OPENCLIP_IMAGE_CATEGORY_LABELS
        });

        detectedType = String(detected && detected.predictedKey ? detected.predictedKey : '').trim().toLowerCase();
        if (!ALLOWED_PRODUCT_TYPES.has(detectedType)) detectedType = '';

        const scoredLabels = Array.isArray(detected && detected.labels) ? detected.labels : [];
        const top1 = scoredLabels[0] || null;
        const top2 = scoredLabels[1] || null;
        const top1Score = Number(top1 && top1.score);
        const top2Score = Number(top2 && top2.score);
        const scoreMargin = Number.isFinite(top1Score) && Number.isFinite(top2Score)
          ? (top1Score - top2Score)
          : Number.POSITIVE_INFINITY;

        const passMinScore = Number.isFinite(top1Score) && top1Score >= OPENCLIP_IMAGE_TYPE_MIN_SCORE;
        const passMargin = Number.isFinite(scoreMargin) && scoreMargin >= OPENCLIP_IMAGE_TYPE_MIN_MARGIN;

        if (detectedType && passMinScore && passMargin) {
          confidentDetectedType = detectedType;
        }

        detectMeta = {
          ...detected,
          top1Score: Number.isFinite(top1Score) ? top1Score : 0,
          top2Score: Number.isFinite(top2Score) ? top2Score : 0,
          scoreMargin: Number.isFinite(scoreMargin) ? scoreMargin : 0,
          minScoreThreshold: OPENCLIP_IMAGE_TYPE_MIN_SCORE,
          minMarginThreshold: OPENCLIP_IMAGE_TYPE_MIN_MARGIN,
          passMinScore,
          passMargin,
          confident: Boolean(detectedType && passMinScore && passMargin)
        };
      } catch (detectError) {
        detectMeta = {
          used: false,
          reason: 'CLASSIFY_FAILED',
          message: detectError && detectError.message ? String(detectError.message) : 'UNKNOWN'
        };
      }
    }

    const selectedType = manualType || confidentDetectedType;

    const baseFilter = {
      daxoa: { $ne: true },
      trangthai: { $in: ['active', 'dangban'] },
      hinhanh: { $exists: true, $ne: '' }
    };

    const typedFilter = selectedType ? { ...baseFilter, loaisanpham: selectedType } : { ...baseFilter };

    const typedDbLimit = Math.max(60, OPENCLIP_IMAGE_DB_LIMIT_TYPED);
    const untypedDbLimit = Math.max(80, OPENCLIP_IMAGE_DB_LIMIT_UNTYPED);
    const broadenedDbLimit = Math.max(untypedDbLimit, OPENCLIP_IMAGE_DB_LIMIT_BROADENED);
    const minTypedResults = Math.max(6, OPENCLIP_IMAGE_MIN_TYPED_RESULTS);

    let rows = await Sanpham.find(typedFilter)
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(selectedType ? typedDbLimit : untypedDbLimit)
      .lean({ virtuals: true });

    let broadened = false;
    if (selectedType && rows.length < minTypedResults) {
      broadened = true;
      rows = await Sanpham.find(baseFilter)
        .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe')
        .sort({ ngaycapnhat: -1, ngaytao: -1 })
        .limit(broadenedDbLimit)
        .lean({ virtuals: true });
    }

    const products = (rows || []).map((item) => {
      const basePrice = Number(item.gia || 0);
      const percent = Number(item.phantramgiamgia || 0);
      const currentPrice = getCurrentPriceFromRecord(item);
      return {
        id: String(item._id || ''),
        tensanpham: String(item.tensanpham || 'Sản phẩm'),
        imageUrl: String(item.hinhanh || '/images/shopping.png'),
        url: item._id ? `/products/${item._id}` : '',
        gia: basePrice,
        giaSauGiam: currentPrice,
        phantramgiamgia: percent,
        soluongton: Number(item.soluongton || 0),
        gioitinh: String(item.gioitinh || ''),
        loaisanpham: String(item.loaisanpham || '')
      };
    });

    const rankCandidateLimit = selectedType && !broadened
      ? Math.max(40, OPENCLIP_IMAGE_RANK_LIMIT_TYPED)
      : Math.max(60, OPENCLIP_IMAGE_RANK_LIMIT_UNTYPED);

    const ranked = await rankProductsByImage({
      imagePath: uploadedPath,
      products,
      topK: Math.max(8, OPENCLIP_RESULT_TOP_K),
      candidateLimit: rankCandidateLimit
    });

    const limitedProducts = Array.isArray(ranked.matches)
      ? ranked.matches.slice(0, Math.max(1, OPENCLIP_UI_MAX_RESULTS))
      : [];

    return res.json({
      success: true,
      data: {
        products: limitedProducts,
        openClipMeta: {
          used: Boolean(ranked.used),
          model: ranked.meta && ranked.meta.model ? ranked.meta.model : '',
          pretrained: ranked.meta && ranked.meta.pretrained ? ranked.meta.pretrained : '',
          device: ranked.meta && ranked.meta.device ? ranked.meta.device : '',
          mode: ranked.meta && ranked.meta.mode ? ranked.meta.mode : 'image',
          candidates: Number(ranked.meta && ranked.meta.candidates ? ranked.meta.candidates : 0),
          rankCandidateLimit: Number(rankCandidateLimit || 0),
          workerTopK: Number(ranked.meta && ranked.meta.workerTopK ? ranked.meta.workerTopK : 0),
          selectedType,
          typeFilterApplied: Boolean(selectedType) && !broadened,
          typeFilterBroadened: Boolean(selectedType) && broadened,
          manualType,
          detectedType,
          confidentDetectedType,
          classifyUsed: Boolean(detectMeta && detectMeta.used),
          classifyReason: detectMeta && detectMeta.reason ? detectMeta.reason : '',
          classifyConfident: Boolean(detectMeta && detectMeta.confident),
          classifyTop1Score: detectMeta && Number.isFinite(Number(detectMeta.top1Score)) ? Number(detectMeta.top1Score) : 0,
          classifyTop2Score: detectMeta && Number.isFinite(Number(detectMeta.top2Score)) ? Number(detectMeta.top2Score) : 0,
          classifyScoreMargin: detectMeta && Number.isFinite(Number(detectMeta.scoreMargin)) ? Number(detectMeta.scoreMargin) : 0,
          classifyMinScoreThreshold: OPENCLIP_IMAGE_TYPE_MIN_SCORE,
          classifyMinMarginThreshold: OPENCLIP_IMAGE_TYPE_MIN_MARGIN,
          classifyTopScore: detectMeta && Array.isArray(detectMeta.labels) && detectMeta.labels[0] && Number.isFinite(Number(detectMeta.labels[0].score))
            ? Number(detectMeta.labels[0].score)
            : 0
        }
      }
    });
  } catch (error) {
    console.error('OpenCLIP image search error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tìm kiếm theo ảnh lúc này' });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlink(uploadedPath, () => {});
    }
  }
};

