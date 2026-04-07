const fs = require('fs');
const { Sanpham } = require('../../../models');
const Danhmuc = require('../../../models/category_model');
const Brand = require('../../../models/brand_model');
const { buildDataContext, askAI } = require('../../../services/content/aiChat.service.js');
const { rankProductsByQuery, rankProductsByImage, classifyImageCategory } = require('../../../services/catalog/openClip.service.js');

const ALLOWED_PRODUCT_TYPES = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
const OPENCLIP_IMAGE_TYPE_MIN_SCORE = Number(process.env.OPENCLIP_IMAGE_TYPE_MIN_SCORE || 0.23);
const OPENCLIP_IMAGE_TYPE_MIN_MARGIN = Number(process.env.OPENCLIP_IMAGE_TYPE_MIN_MARGIN || 0.03);
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

  return (rows || [])
    .filter((item) => {
      const label = normalizeLooseText(getDisplayName(item));
      return wanted.some((term) => label.includes(term));
    })
    .map((item) => ({
      id: String(item._id || ''),
      label: getDisplayName(item)
    }))
    .filter((item) => item.id && item.label);
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

  return (rows || [])
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
}

async function findMatchedBrands(question) {
  const q = normalizeLooseText(question);
  if (!q) return [];

  const rows = await Brand.find({
    daXoa: { $ne: true },
    $or: [{ isActive: true }, { hienthi: true }]
  }).select('_id ten slug').lean();

  return (rows || [])
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
    .slice(0, 2);
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
    /thuong\s*hieu|thương\s*hiệu|brand/i,

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

    const context = await buildDataContext({
      question,
      userId: req.user && req.user._id ? req.user._id : null,
      useOpenClip: provider === 'openclip'
    });

    mergeImageProductsIntoContext(context, imageProducts, imageMeta, question);

    const priceConstraint = extractPriceConstraint(question);
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

    const shouldShowCards = provider === 'openclip' || shouldSuggestProducts(question);
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

    const ranked = await rankProductsByQuery({ query, products, topK: 12 });

    return res.json({
      success: true,
      data: {
        query,
        products: Array.isArray(ranked.matches) ? ranked.matches : [],
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
    const manualType = ALLOWED_PRODUCT_TYPES.has(requestedType) ? requestedType : '';

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

    let rows = await Sanpham.find(typedFilter)
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(selectedType ? 180 : 320)
      .lean({ virtuals: true });

    let broadened = false;
    if (selectedType && rows.length < 24) {
      broadened = true;
      rows = await Sanpham.find(baseFilter)
        .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe')
        .sort({ ngaycapnhat: -1, ngaytao: -1 })
        .limit(300)
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

    const ranked = await rankProductsByImage({
      imagePath: uploadedPath,
      products,
      topK: 12
    });

    return res.json({
      success: true,
      data: {
        products: Array.isArray(ranked.matches) ? ranked.matches : [],
        openClipMeta: {
          used: Boolean(ranked.used),
          model: ranked.meta && ranked.meta.model ? ranked.meta.model : '',
          pretrained: ranked.meta && ranked.meta.pretrained ? ranked.meta.pretrained : '',
          device: ranked.meta && ranked.meta.device ? ranked.meta.device : '',
          mode: ranked.meta && ranked.meta.mode ? ranked.meta.mode : 'image',
          candidates: Number(ranked.meta && ranked.meta.candidates ? ranked.meta.candidates : 0),
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
