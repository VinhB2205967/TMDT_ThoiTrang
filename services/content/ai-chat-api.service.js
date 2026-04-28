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

const FLASH_SALE_QUERY_NOISE_TERMS = new Set([
  'flash', 'sale', 'flase', 'san', 'pham', 'sp', 'dang', 'hien', 'tai', 'co', 'khong',
  'chuong', 'trinh', 'khuyen', 'mai', 'giam', 'gia', 'bao', 'nhieu', 'xem', 'tim', 'cho', 'toi', 'minh'
]);

const SPECIFIC_PRODUCT_QUERY_STOPWORDS = new Set([
  'tim', 'xem', 'cho', 'toi', 'minh', 'em', 'anh', 'chi', 'goi', 'y',
  'de', 'xuat', 'mua', 'muon', 'lay', 'can', 'shop', 'san', 'pham',
  'gia', 'bao', 'nhieu', 'tien', 'la', 'co', 'khong', 'hay', 'nhe',
  'ao', 'quan', 'vay', 'dam', 'giay', 'tui', 'phukien', 'thoi', 'trang',
  'nam', 'nu', 'unisex'
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

function normalizeClientCurrentProduct(rawProduct) {
  const source = rawProduct && typeof rawProduct === 'object' ? rawProduct : {};
  const id = normalizeMessage(source.id || source._id);
  const name = normalizeMessage(source.tensanpham || source.name);
  const url = normalizeMessage(source.url || (id ? `/products/${id}` : ''));
  const imageUrl = normalizeMessage(source.imageUrl || source.image || '/images/shopping.png');
  const salePrice = Number(source.giaSauGiam || source.price || source.gia || 0);
  const originalPrice = Number(source.gia || source.originalPrice || salePrice || 0);
  const productType = normalizeMessage(source.loaisanpham || source.productType);
  const gender = normalizeMessage(source.gioitinh || source.gender);

  if (!id && !name && !url) return null;

  return {
    id,
    tensanpham: name || 'San pham',
    url,
    imageUrl,
    gia: originalPrice > 0 ? originalPrice : salePrice,
    giaSauGiam: salePrice > 0 ? salePrice : originalPrice,
    loaisanpham: productType,
    gioitinh: gender
  };
}

function normalizePageContext(rawPageContext) {
  const source = rawPageContext && typeof rawPageContext === 'object' ? rawPageContext : {};
  return {
    path: normalizeMessage(source.path).slice(0, 240),
    currentProduct: normalizeClientCurrentProduct(source.currentProduct)
  };
}

function mergePageProductIntoContext(context, pageContext) {
  if (!context || !pageContext || !pageContext.currentProduct) return context;

  const pageProduct = pageContext.currentProduct;
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

  pushUnique(pageProduct);
  existingProducts.forEach(pushUnique);

  context.products = mergedProducts.slice(0, 8);
  context.pageContext = {
    path: normalizeMessage(pageContext.path),
    currentProductId: normalizeMessage(pageProduct.id || pageProduct._id),
    hasCurrentProduct: true
  };

  return context;
}

function isPriceLookupQuestionText(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;
  return /\bgia\b|\bbao nhieu\b|\bmay tien\b|\bmuc gia\b/.test(q);
}

function isCurrentProductReferenceQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;
  return /\b(san pham|sp|mau|item|doi|giay|ao|quan|vay|dam|tui)\s+nay\b/.test(q);
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
    .replace(/\u0111/g, 'd')
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

function extractSpecificProductQueryTerms(question) {
  const normalized = normalizeForCompare(question);
  if (!normalized) return [];

  return Array.from(new Set(
    normalized
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3 && !SPECIFIC_PRODUCT_QUERY_STOPWORDS.has(item))
  )).slice(0, 6);
}

function hasSpecificProductNameIntent(question) {
  const terms = extractSpecificProductQueryTerms(question);
  return terms.length > 0;
}

function isStockAvailabilityQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;

  const hasExplicitSize = /\b(?:size|sz|co)\s*[a-z0-9]{1,5}\b/.test(q);
  const hasStockCue = /\b(con|het|co|khong|khong con|bao nhieu|nhieu|it|ton kho|so luong)\b/.test(q);
  if (hasExplicitSize && hasStockCue) return true;

  return [
    /\bcon hang\b/,
    /\bhet hang\b/,
    /\bcon bao nhieu\b/,
    /\bton kho\b/,
    /\bso luong\b/,
    /\bsize\s*[a-z0-9]{1,5}\s*(?:con|het|co|khong|khong con|bao nhieu|nhieu|it)/,
    /\bsz\s*[a-z0-9]{1,5}\s*(?:con|het|co|khong|khong con|bao nhieu|nhieu|it)/
  ].some((pattern) => pattern.test(q));
}

function normalizeSizeKey(value) {
  const key = String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^SIZE/, '')
    .trim();
  return key;
}

function extractRequestedSizes(question) {
  const q = normalizeForCompare(question);
  if (!q) return [];

  const found = [];
  const seen = new Set();
  const regex = /\b(?:size|sz|co)\b\s*([a-z0-9]{1,5})\b/g;
  let match = regex.exec(q);
  while (match) {
    const key = normalizeSizeKey(match[1]);
    if (key && !seen.has(key)) {
      seen.add(key);
      found.push(key);
    }
    match = regex.exec(q);
  }

  return found.slice(0, 4);
}
// Hàm này sẽ xây dựng câu trả lời khi người dùng hỏi về tồn kho và hệ thống đã xác định được sản phẩm cụ thể để trả lời
function buildSizeStockMap(product) {
  const map = new Map();
  const push = (size, quantity) => {
    const key = normalizeSizeKey(size);
    const qty = Number(quantity);
    if (!key || !Number.isFinite(qty) || qty < 0) return;
    map.set(key, Number(map.get(key) || 0) + qty);
  };

  const row = product && typeof product === 'object' ? product : {};
  if (Array.isArray(row.sizes)) {
    row.sizes.forEach((entry) => push(entry && entry.size, entry && entry.soluong));
  }

  if (Array.isArray(row.bienthe)) {
    row.bienthe.forEach((variant) => {
      if (!variant || !Array.isArray(variant.sizes)) return;
      variant.sizes.forEach((entry) => push(entry && entry.size, entry && entry.soluong));
    });
  }

  return map;
}

function hasStrongSpecificProductMatch(product, terms, question) {
  const name = normalizeForCompare(product && (product.tensanpham || product.name));
  if (!name) return false;

  if (name && normalizeForCompare(question).includes(name)) return true;
  if (!Array.isArray(terms) || terms.length === 0) return true;

  const matchedCount = terms.filter((term) => name.includes(term)).length;
  const minRequired = terms.length >= 2 ? 2 : 1;
  return matchedCount >= minRequired;
}

function pickStockLookupProduct({ question, context, pageCurrentProduct }) {
  const terms = extractSpecificProductQueryTerms(question);

  if (
    pageCurrentProduct
    && (isCurrentProductReferenceQuestion(question) || terms.length === 0)
  ) {
    return pageCurrentProduct;
  }

  if (terms.length === 0) return null;

  const pool = [];
  const seen = new Set();
  const pushUnique = (item) => {
    if (!item || typeof item !== 'object') return;
    const id = String(item.id || item._id || '').trim();
    const url = String(item.url || '').trim();
    const name = String(item.tensanpham || item.name || '').trim();
    const key = [id, url, normalizeForCompare(name)].find(Boolean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    pool.push(item);
  };

  (Array.isArray(context && context.products) ? context.products : []).forEach(pushUnique);
  (Array.isArray(context && context.topSelling) ? context.topSelling : []).forEach(pushUnique);

  if (pool.length === 0) return null;

  const ranked = rankProductsBySpecificTerms(pool, question);
  const candidate = ranked[0] || null;
  if (!candidate) return null;
  if (!hasStrongSpecificProductMatch(candidate, terms, question)) return null;

  return candidate;
}
// Hàm này sẽ xây dựng câu trả lời khi người dùng hỏi về tồn kho nhưng hệ thống đã xác định được sản phẩm cụ thể để trả lời
function buildVariantStockBreakdown(product, requestedSizes = []) {
  const row = product && typeof product === 'object' ? product : {};
  const requested = Array.from(new Set((Array.isArray(requestedSizes) ? requestedSizes : [])
    .map((size) => normalizeSizeKey(size))
    .filter(Boolean)));
  const sections = [];

  const mapRows = (sizes = []) => {
    const sizeMap = new Map();
    (Array.isArray(sizes) ? sizes : []).forEach((entry) => {
      const key = normalizeSizeKey(entry && entry.size);
      const qty = Number(entry && entry.soluong);
      if (!key || !Number.isFinite(qty) || qty < 0) return;
      sizeMap.set(key, qty);
    });

    const keys = requested.length > 0
      ? requested
      : Array.from(sizeMap.keys()).sort((a, b) => String(a).localeCompare(String(b), 'vi'));

    return keys.map((size) => ({
      size,
      qty: Number(sizeMap.get(size) || 0)
    }));
  };

  if (Array.isArray(row.sizes) && row.sizes.length > 0) {
    sections.push({
      label: 'Mặc định',
      sizes: mapRows(row.sizes)
    });
  }

  if (Array.isArray(row.bienthe) && row.bienthe.length > 0) {
    row.bienthe.forEach((variant, index) => {
      const variantSizes = mapRows(variant && variant.sizes);
      if (variantSizes.length === 0) return;
      sections.push({
        label: String(variant && variant.mausac || `Màu ${index + 1}`),
        sizes: variantSizes
      });
    });
  }

  return sections
    .map((section) => ({
      ...section,
      sizes: (Array.isArray(section.sizes) ? section.sizes : []).filter((entry) => (
        requested.length > 0 ? true : Number(entry && entry.qty || 0) > 0
      ))
    }))
    .filter((section) => Array.isArray(section.sizes) && section.sizes.length > 0);
}
// Hàm này sẽ xây dựng câu trả lời khi người dùng hỏi về tồn kho nhưng hệ thống chưa xác định được sản phẩm cụ thể nào để trả lời, hoặc có sự mơ hồ về size cần kiểm tra
function buildAmbiguousStockAnswer(question, requestedSizes = []) {
  const typeMatch = inferProductType(question);
  const sizeLabels = Array.from(new Set((Array.isArray(requestedSizes) ? requestedSizes : [])
    .map((size) => normalizeSizeKey(size))
    .filter(Boolean)))
    .map((size) => `size ${size}`);
  const typeLabel = String(typeMatch && typeMatch.label ? typeMatch.label : 'sản phẩm').trim().toLowerCase();

  if (sizeLabels.length > 0) {
    return `Mình chưa xác định được mẫu ${typeLabel} cụ thể để báo tồn kho ${sizeLabels.join(', ')}. Bạn gửi thêm tên sản phẩm hoặc mở đúng trang sản phẩm, mình sẽ trả theo đầy đủ biến thể.`;
  }

  return 'Mình chưa xác định được sản phẩm cụ thể để kiểm tra tồn kho. Bạn gửi thêm tên mẫu hoặc mở đúng trang sản phẩm nhé.';
}
// Hàm này sẽ xây dựng câu trả lời khi người dùng hỏi về tồn kho nhưng hệ thống chưa xác định được sản phẩm cụ thể nào để trả lời, hoặc có sự mơ hồ về size cần kiểm tra
function buildSpecificStockAnswer(product, requestedSizes = []) {
  const row = product && typeof product === 'object' ? product : {};
  const name = String(row.tensanpham || 'Sản phẩm').trim();
  const productUrl = row && row._id ? `/products/${row._id}` : '';

  const sizeStockMap = buildSizeStockMap(row);
  const variantBreakdown = buildVariantStockBreakdown(row, requestedSizes);
  const uniqueRequestedSizes = Array.from(new Set((Array.isArray(requestedSizes) ? requestedSizes : [])
    .map((size) => normalizeSizeKey(size))
    .filter(Boolean)));

  if (sizeStockMap.size === 0) {
    const totalStock = Number(row.soluongton || 0);
    if (uniqueRequestedSizes.length > 0) {
      const label = uniqueRequestedSizes[0];
      return [
        `Hiện mình chưa có tồn kho chi tiết theo size cho ${name}, nên chưa xác nhận chính xác size ${label}.`,
        `Tồn kho tổng hiện tại là ${totalStock} sản phẩm.`,
        productUrl ? `Bạn xem chi tiết tại đây: ${productUrl}` : ''
      ].filter(Boolean).join('\n');
    }

    return [
      `Hiện tại ${name} còn ${totalStock} sản phẩm trong kho.`,
      productUrl ? `Bạn xem chi tiết tại đây: ${productUrl}` : ''
    ].filter(Boolean).join('\n');
  }

  if (uniqueRequestedSizes.length > 0) {
    const totalLines = uniqueRequestedSizes.map((size) => {
      const qty = Number(sizeStockMap.get(size) || 0);
      return `- Tổng size ${size}: ${qty} sản phẩm`;
    });
    const variantLines = variantBreakdown.flatMap((section) => {
      const detail = section.sizes
        .map((entry) => `size ${entry.size}: ${Number(entry.qty || 0)} sản phẩm`)
        .join(', ');
      return detail ? [`- ${section.label}: ${detail}`] : [];
    });

    return [
      `Tồn kho theo size của ${name}:`,
      ...totalLines,
      ...(variantLines.length > 0 ? ['Chi tiết theo biến thể:', ...variantLines] : []),
      productUrl ? `Bạn xem chi tiết tại đây: ${productUrl}` : ''
    ].filter(Boolean).join('\n');
  }

  const entries = variantBreakdown.length > 0
    ? variantBreakdown.map((section) => `${section.label}: ${section.sizes.map((entry) => `Size ${entry.size} (${entry.qty})`).join(', ')}`)
    : Array.from(sizeStockMap.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'vi'))
      .slice(0, 8)
      .map(([size, qty]) => `Size ${size} (${qty})`);

  return [
    `Hiện ${name} còn hàng ở các size: ${entries.join(', ')}.`,
    productUrl ? `Bạn xem chi tiết tại đây: ${productUrl}` : ''
  ].filter(Boolean).join('\n');
}

function rankProductsBySpecificTerms(products, question) {
  const list = Array.isArray(products) ? products : [];
  if (list.length <= 1) return list;

  const terms = extractSpecificProductQueryTerms(question);
  if (!terms.length) return list;

  const questionNorm = normalizeForCompare(question);
  const ranked = list
    .map((item, index) => {
      const name = normalizeForCompare(item && (item.tensanpham || item.name));
      if (!name) {
        return { item, index, score: -1 };
      }

      const matchedCount = terms.filter((term) => name.includes(term)).length;
      const allMatched = matchedCount === terms.length;
      let score = matchedCount * 20;

      if (allMatched) score += 80;
      if (questionNorm.includes(name)) score += 120;
      if (name.includes(questionNorm) && questionNorm.length >= 5) score += 80;

      return { item, index, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.item);

  return ranked;
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

function isOutfitSuggestionQuestion(question, pageCurrentProduct) {
  const q = normalizeForCompare(question);
  if (!q) return false;
  if (/\bdon hang|voucher|bang size|size guide|admin\b/.test(q)) return false;
  if (/\blookbook\b|\bblog\b|\bbai viet\b|\btin tuc\b/.test(q)) return false;

  if (/\boutfit\b|\bphoi do\b|\bmix\b|\bmix match\b|\bset do\b|\bcombo\b/.test(q)) return true;
  if (/\bphoi cung\b|\bmac voi\b|\bket hop\b/.test(q)) return true;

  if (pageCurrentProduct && /\b(mau nay|san pham nay|sp nay|item nay)\b/.test(q) && /\b(phoi|mac|ket hop)\b/.test(q)) {
    return true;
  }

  return false;
}

function detectRequestedOutfitRoles(question) {
  const q = normalizeForCompare(question);
  if (!q) return [];

  const roles = [];
  const push = (role) => {
    if (!role || roles.includes(role)) return;
    roles.push(role);
  };

  if (/\bao khoac\b|\bjacket\b|\bblazer\b|\bcardigan\b|\bouterwear\b/.test(q)) push('outerwear');
  if (/\bao\b|\bpolo\b|\bthun\b|\bso mi\b|\bshirt\b|\btee\b|\bhoodie\b/.test(q)) push('top');
  if (/\bquan\b|\bjean\b|\bshort\b|\bjogger\b|\btrouser\b|\bpants?\b/.test(q)) push('bottom');
  if (/\bvay\b|\bdam\b|\bdress\b|\bskirt\b/.test(q)) push('dress');
  if (/\bgiay\b|\bsneaker\b|\bsandal\b|\bboot\b/.test(q)) push('shoes');
  if (/\btui\b|\bbag\b|\bhandbag\b/.test(q)) push('bag');
  if (/\bphu kien\b|\baccessor\b|\bthat lung\b|\bbelt\b|\bmu\b|\bnon\b|\bhat\b|\bcap\b|\bscarf\b/.test(q)) push('accessory');

  return roles;
}

function resolveOutfitRoleFromType(typeValue, fallbackText = '') {
  const type = normalizeForCompare(typeValue);
  const text = normalizeForCompare(fallbackText);
  const source = `${type} ${text}`.trim();
  if (!source) return '';

  if (/\baokhoac\b|\bao khoac\b|\bjacket\b|\bblazer\b|\bcardigan\b|\bcoat\b|\bouterwear\b/.test(source)) return 'outerwear';
  if (/\bquan\b|\bjean\b|\bshort\b|\bjogger\b|\btrouser\b|\bpants?\b/.test(source)) return 'bottom';
  if (/\bvay\b|\bdam\b|\bdress\b|\bskirt\b/.test(source)) return 'dress';
  if (/\bgiay\b|\bsneaker\b|\bsandal\b|\bboot\b|\bshoe\b/.test(source)) return 'shoes';
  if (/\btui\b|\bbag\b|\bhandbag\b/.test(source)) return 'bag';
  if (/\bphu kien\b|\baccessor\b|\bthat lung\b|\bbelt\b|\bmu\b|\bnon\b|\bhat\b|\bcap\b|\bscarf\b/.test(source)) return 'accessory';
  if (/\bao\b|\bpolo\b|\bthun\b|\bso mi\b|\bshirt\b|\btee\b|\bhoodie\b/.test(source)) return 'top';
  return '';
}

function getOutfitRoleLabel(role, fallback = 'Món phối cùng') {
  const map = {
    base: 'Món chính',
    top: 'Áo',
    bottom: 'Quần',
    dress: 'Váy/đầm',
    shoes: 'Giày',
    bag: 'Túi',
    accessory: 'Phụ kiện',
    outerwear: 'Áo khoác'
  };
  return map[role] || fallback;
}

function buildOutfitRolePlan(baseProduct, question) {
  const baseRole = resolveOutfitRoleFromType(
    baseProduct && (baseProduct.loaisanpham || baseProduct.productType || baseProduct.type),
    baseProduct && (baseProduct.tensanpham || baseProduct.name || '')
  );
  const requestedRoles = detectRequestedOutfitRoles(question).filter((role) => role !== baseRole);
  const fallbackRolesByBase = {
    top: ['bottom', 'shoes', 'bag'],
    outerwear: ['top', 'bottom', 'shoes'],
    bottom: ['top', 'shoes', 'bag'],
    dress: ['shoes', 'bag', 'outerwear'],
    shoes: ['top', 'bottom', 'bag'],
    bag: ['top', 'bottom', 'shoes'],
    accessory: ['top', 'bottom', 'shoes']
  };

  const fallbackRoles = fallbackRolesByBase[baseRole] || ['top', 'bottom', 'shoes'];
  const plan = [];
  const push = (role) => {
    if (!role || role === baseRole || plan.includes(role)) return;
    plan.push(role);
  };

  requestedRoles.forEach(push);
  fallbackRoles.forEach(push);
  return plan.slice(0, 3);
}

function extractOccasionIdsFromProduct(product) {
  const ids = new Set();
  const push = (value) => {
    const id = String(value || '').trim();
    if (id) ids.add(id);
  };

  if (product && product.occasion) push(product.occasion);
  if (product && product.dip_sudung_id) push(product.dip_sudung_id);
  (Array.isArray(product && product.occasions) ? product.occasions : []).forEach(push);
  (Array.isArray(product && product.occasionIds) ? product.occasionIds : []).forEach(push);
  return Array.from(ids);
}

function mapProductForOutfit(item) {
  const source = item && typeof item === 'object' ? item : {};
  const id = String(source.id || source._id || '').trim();
  if (!id) return null;

  const currentPrice = Number(source.giaSauGiam || source.price || source.giaMoi || source.gia || 0);
  const originalPrice = Number(source.gia || source.originalPrice || currentPrice || 0);
  const imageUrl = String(source.imageUrl || source.hinhanh || source.image || '/images/shopping.png').trim();
  const url = String(source.url || (id ? `/products/${id}` : '')).trim();
  const name = String(source.tensanpham || source.name || 'San pham').trim();
  if (!name) return null;

  return {
    id,
    tensanpham: name,
    imageUrl: imageUrl || '/images/shopping.png',
    url,
    gia: originalPrice > 0 ? originalPrice : currentPrice,
    giaSauGiam: currentPrice > 0 ? currentPrice : originalPrice,
    gioitinh: String(source.gioitinh || source.gender || '').trim(),
    loaisanpham: String(source.loaisanpham || source.productType || source.type || '').trim(),
    occasionIds: extractOccasionIdsFromProduct(source)
  };
}

function pushUniqueOutfitProduct(map, item) {
  const normalized = mapProductForOutfit(item);
  if (!normalized || !normalized.id || map.has(normalized.id)) return;
  map.set(normalized.id, normalized);
}

function productMatchesOutfitRole(product, role) {
  const sourceText = `${product && (product.tensanpham || product.name || '')} ${product && (product.url || '')}`;
  const productRole = resolveOutfitRoleFromType(product && (product.loaisanpham || product.productType || product.type), sourceText);
  if (!productRole) return false;

  if (role === 'top') return productRole === 'top';
  if (role === 'bottom') return productRole === 'bottom';
  if (role === 'dress') return productRole === 'dress';
  if (role === 'shoes') return productRole === 'shoes';
  if (role === 'bag') return productRole === 'bag';
  if (role === 'accessory') return productRole === 'accessory';
  if (role === 'outerwear') return productRole === 'outerwear';
  return false;
}

function getOutfitRoleTypeValues(role) {
  const map = {
    top: ['ao'],
    bottom: ['quan'],
    dress: ['vay'],
    shoes: ['giay'],
    bag: ['tui'],
    accessory: ['phukien'],
    outerwear: ['aokhoac']
  };
  return Array.isArray(map[role]) ? map[role] : [];
}

async function hydrateCurrentProductForOutfit(pageCurrentProduct) {
  const fallback = mapProductForOutfit(pageCurrentProduct);
  const id = String(pageCurrentProduct && pageCurrentProduct.id || '').trim();
  if (!id) return fallback;

  const row = await Sanpham.findOne({
    _id: id,
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] }
  })
    .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe occasion occasions dip_sudung_id')
    .lean({ virtuals: true });

  if (!row) return fallback;

  const flashMap = await getActiveFlashSalePriceMap([row._id]);
  const basePrice = Number(row && row.gia || 0);
  const currentPrice = getCurrentPriceFromRecord(row);
  const finalPrice = applyFlashSaleToCurrentPrice({
    record: row,
    currentPrice,
    flashEntry: flashMap.get(String(row && row._id || ''))
  });

  return mapProductForOutfit({
    ...row,
    id: String(row && row._id || ''),
    imageUrl: String(row && row.hinhanh || '/images/shopping.png'),
    url: row && row._id ? `/products/${row._id}` : '',
    gia: basePrice,
    giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice
  }) || fallback;
}

function pickBaseOutfitProduct({ pageProduct, context, question }) {
  if (pageProduct && pageProduct.id) return pageProduct;

  const byId = new Map();
  (Array.isArray(context && context.products) ? context.products : []).forEach((item) => pushUniqueOutfitProduct(byId, item));
  (Array.isArray(context && context.topSelling) ? context.topSelling : []).forEach((item) => pushUniqueOutfitProduct(byId, item));
  (Array.isArray(context && context.lookbooks) ? context.lookbooks : []).forEach((lookbook) => {
    (Array.isArray(lookbook && lookbook.products) ? lookbook.products : []).forEach((item) => pushUniqueOutfitProduct(byId, item));
  });

  const requestedType = inferProductType(question);
  const requestedGender = inferGender(question);
  let candidates = Array.from(byId.values());

  if (requestedType) {
    const typed = candidates.filter((item) => productMatchesRequestedType(item, requestedType.value));
    if (typed.length > 0) candidates = typed;
  }

  if (requestedGender) {
    const gendered = candidates.filter((item) => productMatchesRequestedGender(item, requestedGender.value));
    if (gendered.length > 0) candidates = gendered;
  }

  const ranked = rankProductsBySpecificTerms(candidates, question);
  return ranked[0] || candidates[0] || null;
}

async function fetchOutfitDbCandidates({ rolePlan, requestedGender, occasionIds = [] }) {
  const typeValues = Array.from(new Set(
    (Array.isArray(rolePlan) ? rolePlan : [])
      .flatMap((role) => getOutfitRoleTypeValues(role))
      .filter(Boolean)
  ));

  if (typeValues.length === 0) return [];

  const query = {
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] },
    loaisanpham: { $in: typeValues }
  };

  if (requestedGender) {
    query.gioitinh = requestedGender === 'unisex'
      ? { $in: ['unisex', 'nam', 'nu'] }
      : { $in: [requestedGender, 'unisex'] };
  }

  if (Array.isArray(occasionIds) && occasionIds.length > 0) {
    query.$and = [{
      $or: [
        { occasion: { $in: occasionIds } },
        { dip_sudung_id: { $in: occasionIds } },
        { occasions: { $in: occasionIds } }
      ]
    }];
  }

  const rows = await Sanpham.find(query)
    .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe occasion occasions dip_sudung_id ngaycapnhat ngaytao')
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .limit(240)
    .lean({ virtuals: true });

  if (!Array.isArray(rows) || rows.length === 0) return [];

  const flashMap = await getActiveFlashSalePriceMap(rows.map((item) => item && item._id));
  return rows
    .map((item) => {
      const basePrice = Number(item && item.gia || 0);
      const currentPrice = getCurrentPriceFromRecord(item);
      const finalPrice = applyFlashSaleToCurrentPrice({
        record: item,
        currentPrice,
        flashEntry: flashMap.get(String(item && item._id || ''))
      });

      return mapProductForOutfit({
        ...item,
        id: String(item && item._id || ''),
        imageUrl: String(item && item.hinhanh || '/images/shopping.png'),
        url: item && item._id ? `/products/${item._id}` : '',
        gia: basePrice,
        giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice
      });
    })
    .filter(Boolean);
}

function selectOutfitProducts({ baseProduct, candidates, rolePlan, question, requestedGender }) {
  const selected = [];
  const selectedIds = new Set();
  const take = (item, role) => {
    const normalized = mapProductForOutfit(item);
    if (!normalized || !normalized.id || selectedIds.has(normalized.id)) return;
    selected.push({ role, item: normalized });
    selectedIds.add(normalized.id);
  };

  take(baseProduct, 'base');
  const ranked = rankProductsBySpecificTerms(
    (Array.isArray(candidates) ? candidates : []).filter((item) => item && String(item.id || '') !== String(baseProduct && baseProduct.id || '')),
    question
  );

  const fallbackRoles = {
    bag: ['accessory'],
    accessory: ['bag'],
    outerwear: ['top'],
    top: ['outerwear']
  };

  rolePlan.forEach((role) => {
    const allowedRoles = [role].concat(fallbackRoles[role] || []);
    const picked = ranked.find((item) => {
      if (!item) return false;
      if (requestedGender && !productMatchesRequestedGender(item, requestedGender)) return false;
      return allowedRoles.some((allowedRole) => productMatchesOutfitRole(item, allowedRole));
    });
    if (picked) take(picked, role);
  });

  return selected;
}
// Oufit nhanh
function buildOutfitSuggestionAnswer({ question, baseProduct, selectedItems, occasionMatch, lookbook }) {
  const extras = Array.isArray(selectedItems) ? selectedItems.filter((entry) => entry && entry.role !== 'base') : [];
  if (!baseProduct || extras.length === 0) return '';

  const intro = baseProduct && baseProduct.id
    ? `Mình gợi ý một outfit để phối cùng ${baseProduct.tensanpham || 'sản phẩm này'}:`
    : occasionMatch && occasionMatch.label
      ? `Mình gợi ý một outfit hợp ${occasionMatch.label}:`
      : 'Mình gợi ý một outfit dễ mặc, dễ đẹp:';

  const lines = [intro];
  const withLine = (index, label, item) => {
    const price = Number(item && (item.giaSauGiam || item.gia) || 0);
    const priceText = price > 0 ? ` - ${price.toLocaleString('vi-VN')}đ` : '';
    const urlText = item && item.url ? ` (tại đây: ${item.url})` : '';
    lines.push(`${index}. ${label}: ${item && item.tensanpham ? item.tensanpham : 'Sản phẩm'}${priceText}${urlText}`);
  };

  withLine(1, getOutfitRoleLabel('base'), baseProduct);
  extras.forEach((entry, index) => {
    withLine(index + 2, getOutfitRoleLabel(entry.role), entry.item);
  });

  if (lookbook && lookbook.url) {
    lines.push(`Bạn xem thêm lookbook phù hợp tại đây: ${lookbook.url}`);
  } else if (isProductFilterQuestion(question)) {
    lines.push('Nếu bạn muốn, mình có thể đổi outfit theo dịp sử dụng, độ tuổi hoặc thương hiệu.');
  }

  return lines.join('\n');
}

function buildOutfitSuggestionActions({ baseProduct, selectedItems, requestedGender, occasionMatch, lookbook }) {
  const actions = [];
  if (baseProduct && baseProduct.url) {
    pushUniqueAction(actions, { label: 'Xem món chính', url: String(baseProduct.url).trim(), kind: 'primary' });
  }

  const filters = {};
  if (requestedGender) filters.gioitinh = requestedGender;
  if (occasionMatch && occasionMatch.id) filters.occasion = occasionMatch.id;
  if (Object.keys(filters).length > 0) {
    pushUniqueAction(actions, { label: 'Xem sản phẩm phù hợp', url: buildProductsUrl(filters), kind: 'filter' });
  }

  const extraItems = Array.isArray(selectedItems)
    ? selectedItems.filter((entry) => entry && entry.role !== 'base')
    : [];
  extraItems.slice(0, 2).forEach((entry) => {
    if (!entry || !entry.item || !entry.item.url) return;
    pushUniqueAction(actions, {
      label: getOutfitRoleLabel(entry.role, 'Xem món phối'),
      url: String(entry.item.url).trim(),
      kind: 'link'
    });
  });

  if (lookbook && lookbook.url) {
    pushUniqueAction(actions, { label: 'Xem lookbook', url: String(lookbook.url).trim(), kind: 'link' });
  }

  return actions.slice(0, 5);
}

async function getQuickOutfitSuggestionPayload({
  question,
  userId,
  pageCurrentProduct,
  imageProducts,
  imageMeta,
  pageContext
}) {
  const context = await buildDataContext({
    question,
    userId,
    useOpenClip: true
  });

  mergeImageProductsIntoContext(context, imageProducts, imageMeta, question);
  mergePageProductIntoContext(context, pageContext);

  const pageProduct = await hydrateCurrentProductForOutfit(pageCurrentProduct);
  const baseProduct = pickBaseOutfitProduct({
    pageProduct,
    context,
    question
  });

  if (!baseProduct) return null;

  const rolePlan = buildOutfitRolePlan(baseProduct, question);
  if (rolePlan.length === 0) return null;

  const requestedGenderMatch = inferGender(question);
  const baseGender = normalizeForCompare(baseProduct.gioitinh || '');
  const requestedGender = requestedGenderMatch && requestedGenderMatch.value
    ? requestedGenderMatch.value
    : (baseGender === 'nam' || baseGender === 'nu' ? baseGender : '');

  const occasionMatches = await findMatchedOccasions(question);
  const occasionIds = occasionMatches.length > 0
    ? occasionMatches.map((item) => String(item && item.id || '').trim()).filter(Boolean)
    : extractOccasionIdsFromProduct(baseProduct);

  const pool = new Map();
  pushUniqueOutfitProduct(pool, baseProduct);
  (Array.isArray(context && context.products) ? context.products : []).forEach((item) => pushUniqueOutfitProduct(pool, item));
  (Array.isArray(context && context.topSelling) ? context.topSelling : []).forEach((item) => pushUniqueOutfitProduct(pool, item));
  (Array.isArray(context && context.lookbooks) ? context.lookbooks : []).forEach((lookbook) => {
    (Array.isArray(lookbook && lookbook.products) ? lookbook.products : []).forEach((item) => pushUniqueOutfitProduct(pool, item));
  });

  const dbCandidates = await fetchOutfitDbCandidates({
    rolePlan,
    requestedGender,
    occasionIds
  });
  dbCandidates.forEach((item) => pushUniqueOutfitProduct(pool, item));

  const selectedItems = selectOutfitProducts({
    baseProduct,
    candidates: Array.from(pool.values()),
    rolePlan,
    question,
    requestedGender
  });

  if (!Array.isArray(selectedItems) || selectedItems.length < 2) return null;

  const pickedLookbook = Array.isArray(context && context.lookbooks) && context.lookbooks.length > 0
    ? (pickBestLookbookByQuestion(context.lookbooks, question) || context.lookbooks[0])
    : null;

  const answer = buildOutfitSuggestionAnswer({
    question,
    baseProduct,
    selectedItems,
    occasionMatch: occasionMatches[0] || null,
    lookbook: pickedLookbook
  });

  if (!answer) return null;

  const suggestedProducts = selectedItems.map((entry) => toSuggestedCard(entry.item));
  return {
    answer,
    suggestedProducts,
    suggestedActions: buildOutfitSuggestionActions({
      baseProduct,
      selectedItems,
      requestedGender,
      occasionMatch: occasionMatches[0] || null,
      lookbook: pickedLookbook
    }),
    contextMeta: {
      ...buildQuickContextMeta({
        products: suggestedProducts.length,
        hasFlashSale: selectedItems.some((entry) => Number(entry && entry.item && entry.item.giaSauGiam || 0) > 0 && Number(entry && entry.item && entry.item.gia || 0) > Number(entry && entry.item && entry.item.giaSauGiam || 0))
      }),
      topSelling: Array.isArray(context && context.topSelling) ? context.topSelling.length : 0
    }
  };
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

function buildPriceListUrlFromConstraint(constraint, extraFilters = {}) {
  const filters = {};
  if (extraFilters && extraFilters.loaisanpham) filters.loaisanpham = String(extraFilters.loaisanpham).trim();
  if (extraFilters && extraFilters.gioitinh) filters.gioitinh = String(extraFilters.gioitinh).trim();
  if (Number.isFinite(constraint && constraint.min)) filters.priceMin = String(constraint.min);
  if (Number.isFinite(constraint && constraint.max)) filters.priceMax = String(constraint.max);
  return buildProductsUrl(filters);
}

function toSuggestedCard(item) {
  const id = String(item && (item.id || item._id) || '').trim();
  const finalPrice = Number(item && (item.giaSauGiam || item.gia) || 0);
  const originalPrice = Number(item && item.gia || 0);
  const hasDiscount = originalPrice > 0 && finalPrice > 0 && finalPrice < originalPrice;
  const rawImageUrl = String(item && (item.imageUrl || item.hinhanh || item.image) || '').trim();
  return {
    id,
    name: String(item && (item.tensanpham || item.name || item.ten) || 'Sản phẩm'),
    url: String(item && item.url || (id ? `/products/${id}` : '')),
    imageUrl: rawImageUrl || '/images/shirt.png',
    price: finalPrice,
    originalPrice,
    hasDiscount,
    priceText: finalPrice > 0 ? `${finalPrice.toLocaleString('vi-VN')}đ` : '',
    originalPriceText: hasDiscount ? `${originalPrice.toLocaleString('vi-VN')}đ` : ''
  };
}

async function getQuickProductsByPriceConstraint(question, priceConstraint) {
  const typeMatch = inferProductType(question);
  const genderMatch = inferGender(question);

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
      loaisanpham: String(item && item.loaisanpham || ''),
      gioitinh: String(item && item.gioitinh || ''),
      gia: basePrice,
      giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice
    };
  });

  const filtered = mapped.filter((item) => {
    if (!matchPriceConstraint(item.giaSauGiam || item.gia, priceConstraint)) return false;
    if (typeMatch && !productMatchesRequestedType(item, typeMatch.value)) return false;
    if (genderMatch && !productMatchesRequestedGender(item, genderMatch.value)) return false;
    return true;
  });
  return filtered.slice(0, 8);
}
// Giá nhanh
function buildQuickPriceListingAnswer(products, priceConstraint, extraFilters = {}) {
  const items = Array.isArray(products) ? products.slice(0, 6) : [];
  if (!items.length) return '';

  const listUrl = buildPriceListUrlFromConstraint(priceConstraint, extraFilters);
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
// HÀM KIỂM TRA CÓ PHẢI LÀ CÂU HỎI LIÊN QUAN ĐẾN TÌM KIẾM SẢN PHẨM THEO TIÊU CHÍ (FACET) KHÔNG
function isFacetListingQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;
  if (/\bdon hang|ma don|voucher|bang size|size guide\b/.test(q)) return false;
  if (/gia cua|gia ban cua|bao nhieu tien cua/.test(q)) return false;
  if (/\blookbook\b|\bblog\b|\bbai viet\b|\btin tuc\b/.test(q)) return false;
  if (hasSpecificProductNameIntent(question)) return false;

  return Boolean(
    inferProductType(question)
    || inferGender(question)
    || isProductFilterQuestion(question)
  );
}
// HÀM LẤY SẢN PHẨM NHANH THEO TIÊU CHÍ (FACET) VÀ GIÁ CẢ
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
// Yêu thích nhanh
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
// Thương hiệu nhanh
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
// Flash sale nhanh
function isFlashSaleQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;

  if (/\bvoucher\b|\bma giam\b|\bcoupon\b/.test(q)) return false;
  if (/\bflashsale\b|\bflash\s*sale\b|\bflase\b/.test(q)) return true;

  const hasSaleToken = /\bsale\b/.test(q);
  const hasProductToken = /\bsan pham\b|\bsp\b|\bmat hang\b|\bhang\b/.test(q);
  return hasSaleToken && hasProductToken;
}

function formatDateTimeVi(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

// Flash sale nhanh
async function getQuickFlashSalePayload(question) {
  if (!isFlashSaleQuestion(question)) return null;

  const now = new Date();
  const activeSale = await FlashSale.findOne({
    hienthi: true,
    batdau: { $lte: now },
    ketthuc: { $gte: now }
  })
    .select('ten batdau ketthuc phantramgiamgia sanpham')
    .sort({ batdau: -1 })
    .lean();

  if (!activeSale) {
    return {
      answer: 'Hiện chưa có chương trình Flash Sale đang diễn ra. Bạn có thể xem sản phẩm đang bán tại đây: /products',
      suggestedProducts: [],
      suggestedActions: [
        { label: 'Xem sản phẩm', url: '/products', kind: 'primary' },
        { label: 'Mở trang chủ', url: '/', kind: 'link' }
      ],
      contextMeta: buildQuickContextMeta({ products: 0, hasFlashSale: false })
    };
  }

  const saleItems = Array.isArray(activeSale.sanpham) ? activeSale.sanpham : [];
  const productIds = Array.from(new Set(
    saleItems
      .map((entry) => String(entry && entry.sanpham_id || '').trim())
      .filter(Boolean)
  ));

  if (productIds.length === 0) {
    return {
      answer: `Hiện chương trình "${String(activeSale.ten || 'Flash Sale').trim() || 'Flash Sale'}" đang diễn ra nhưng chưa có sản phẩm khả dụng để hiển thị.`,
      suggestedProducts: [],
      suggestedActions: [
        { label: 'Mở trang chủ', url: '/', kind: 'primary' },
        { label: 'Xem sản phẩm', url: '/products', kind: 'link' }
      ],
      contextMeta: buildQuickContextMeta({ products: 0, hasFlashSale: true })
    };
  }

  const rows = await Sanpham.find({
    _id: { $in: productIds },
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] }
  })
    .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe ngaycapnhat ngaytao')
    .lean({ virtuals: true });

  const rowMap = new Map((rows || []).map((item) => [String(item && item._id || ''), item]));
  const mappedProducts = saleItems
    .map((entry) => {
      const product = rowMap.get(String(entry && entry.sanpham_id || '').trim());
      if (!product) return null;

      const basePrice = Number(product && product.gia || 0);
      const currentPrice = getCurrentPriceFromRecord(product);
      const salePercent = Number(activeSale && activeSale.phantramgiamgia || 0);
      const saleByPercent = basePrice > 0 && salePercent > 0
        ? Math.round(basePrice * (1 - salePercent / 100))
        : 0;
      const fixedPrice = Number(entry && entry.giagiam || 0);
      const saleByFixed = fixedPrice > 0 && (basePrice <= 0 || fixedPrice <= basePrice) ? fixedPrice : 0;
      const candidates = [currentPrice, saleByPercent, saleByFixed].filter((value) => Number.isFinite(value) && value > 0);
      const finalPrice = candidates.length > 0 ? Math.min(...candidates) : 0;

      return {
        id: String(product && product._id || ''),
        tensanpham: String(product && product.tensanpham || 'Sản phẩm'),
        imageUrl: String(product && product.hinhanh || '/images/shopping.png'),
        url: product && product._id ? `/products/${product._id}` : '',
        gia: basePrice > 0 ? basePrice : finalPrice,
        giaSauGiam: finalPrice > 0 ? finalPrice : basePrice,
        gioitinh: String(product && product.gioitinh || ''),
        loaisanpham: String(product && product.loaisanpham || '')
      };
    })
    .filter(Boolean);

  if (mappedProducts.length === 0) {
    return {
      answer: `Hiện chương trình "${String(activeSale.ten || 'Flash Sale').trim() || 'Flash Sale'}" đang diễn ra nhưng chưa có sản phẩm phù hợp để hiển thị.`,
      suggestedProducts: [],
      suggestedActions: [
        { label: 'Mở trang chủ', url: '/', kind: 'primary' },
        { label: 'Xem sản phẩm', url: '/products', kind: 'link' }
      ],
      contextMeta: buildQuickContextMeta({ products: 0, hasFlashSale: true })
    };
  }

  const typeMatch = inferProductType(question);
  const genderMatch = inferGender(question);

  let selectedProducts = mappedProducts.slice();
  if (typeMatch) {
    const typed = selectedProducts.filter((item) => productMatchesRequestedType(item, typeMatch.value));
    if (typed.length > 0) selectedProducts = typed;
  }

  if (genderMatch) {
    const gendered = selectedProducts.filter((item) => productMatchesRequestedGender(item, genderMatch.value));
    if (gendered.length > 0) selectedProducts = gendered;
  }

  const searchTerms = extractQuickSearchTerms(question).filter((term) => !FLASH_SALE_QUERY_NOISE_TERMS.has(term));
  if (searchTerms.length > 0) {
    const matched = selectedProducts.filter((item) => hasAnyQuickSearchTerm(
      `${item.tensanpham} ${item.loaisanpham} ${item.gioitinh}`,
      searchTerms
    ));
    if (matched.length > 0) selectedProducts = matched;
  }

  const finalSelection = (selectedProducts.length > 0 ? selectedProducts : mappedProducts).slice(0, 8);
  const saleName = String(activeSale && activeSale.ten || 'Flash Sale').trim() || 'Flash Sale';
  const salePercent = Number(activeSale && activeSale.phantramgiamgia || 0);
  const startText = formatDateTimeVi(activeSale && activeSale.batdau);
  const endText = formatDateTimeVi(activeSale && activeSale.ketthuc);

  const lines = [
    `Hiện tại có chương trình "${saleName}"${salePercent > 0 ? ` giảm ${salePercent}%` : ''} cho một số sản phẩm.`
  ];
  if (startText || endText) {
    lines.push(`Thời gian: ${startText || 'không rõ'} - ${endText || 'không rõ'}.`);
  }
  if (finalSelection.length > 0) {
    lines.push('Mình chọn nhanh một số sản phẩm nổi bật:');
    finalSelection.slice(0, 5).forEach((item, index) => {
      const finalPrice = Number(item && (item.giaSauGiam || item.gia) || 0);
      const priceText = finalPrice > 0 ? formatMoney(finalPrice) : 'Liên hệ';
      const url = String(item && item.url || '').trim();
      lines.push(`${index + 1}. ${item && item.tensanpham ? item.tensanpham : 'Sản phẩm'}: ${priceText}${url ? ` (tại đây: ${url})` : ''}`);
    });
  }
  lines.push('Bạn có thể xem thêm ở trang chủ hoặc danh sách sản phẩm: /products');

  const suggestedActions = [];
  pushUniqueAction(suggestedActions, { label: 'Mở trang chủ', url: '/', kind: 'primary' });
  pushUniqueAction(suggestedActions, { label: 'Xem sản phẩm', url: '/products', kind: 'link' });
  if (typeMatch || genderMatch) {
    pushUniqueAction(suggestedActions, {
      label: 'Xem sản phẩm phù hợp',
      url: buildProductsUrl({
        ...(typeMatch ? { loaisanpham: typeMatch.value } : {}),
        ...(genderMatch ? { gioitinh: genderMatch.value } : {})
      }),
      kind: 'filter'
    });
  }
  if (finalSelection[0] && finalSelection[0].url) {
    pushUniqueAction(suggestedActions, { label: 'Sản phẩm nổi bật', url: finalSelection[0].url, kind: 'link' });
  }

  return {
    answer: lines.join('\n'),
    suggestedProducts: finalSelection.map(toSuggestedCard),
    suggestedActions: suggestedActions.slice(0, 5),
    contextMeta: buildQuickContextMeta({
      products: finalSelection.length,
      hasFlashSale: true
    })
  };
}
// Yêu thích nhanh
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
// Lọc nhanh
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
// LOOKBOOK VÀ SẢN PHẨM TRONG LOOKBOOK
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
  if (/outfit|phoi\s*do|mix\s*(?:do|match)|set\s*do|combo|mac\s*voi|phoi\s*cung|ket\s*hop/i.test(q)) {
    return true;
  }

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

const COLOR_ALIAS_MAP = {
  'xanh la': ['xanh la', 'xanhla', 'green'],
  xanh: ['xanh duong', 'xanh d\u01b0\u01a1ng', 'xanh', 'blue'],
  trang: ['trang', 'tr\u1eafng', 'white'],
  den: ['den', '\u0111en', 'black'],
  do: ['do', '\u0111\u1ecf', 'red'],
  vang: ['vang', 'v\u00e0ng', 'yellow'],
  tim: ['tim', 't\u00edm', 'purple', 'violet'],
  cam: ['cam', 'orange'],
  nau: ['nau', 'n\u00e2u', 'brown'],
  hong: ['hong', 'h\u1ed3ng', 'pink'],
  be: ['be', 'beige', 'kem', 'cream'],
  xam: ['xam', 'x\u00e1m', 'ghi', 'gray', 'grey']
};

const COLOR_DISPLAY_LABEL_MAP = {
  'xanh la': 'xanh l\u00e1',
  xanh: 'xanh',
  trang: 'tr\u1eafng',
  den: '\u0111en',
  do: '\u0111\u1ecf',
  vang: 'v\u00e0ng',
  tim: 't\u00edm',
  cam: 'cam',
  nau: 'n\u00e2u',
  hong: 'h\u1ed3ng',
  be: 'be',
  xam: 'x\u00e1m'
};

const COLOR_ALIAS_TO_KEY = (() => {
  const map = new Map();
  Object.entries(COLOR_ALIAS_MAP).forEach(([key, aliases]) => {
    const normalizedKey = normalizeForCompare(key);
    if (normalizedKey) map.set(normalizedKey, key);
    (Array.isArray(aliases) ? aliases : []).forEach((alias) => {
      const normalizedAlias = normalizeForCompare(alias);
      if (normalizedAlias) map.set(normalizedAlias, key);
    });
  });
  return map;
})();

function extractColorKeysFromText(text) {
  const source = normalizeForCompare(text);
  if (!source) return [];

  const aliasEntries = Array.from(COLOR_ALIAS_TO_KEY.entries())
    .sort((a, b) => b[0].length - a[0].length);

  const keys = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] === ' ') {
      cursor += 1;
      continue;
    }

    let matchedAlias = '';
    let matchedKey = '';
    for (let i = 0; i < aliasEntries.length; i += 1) {
      const [alias, key] = aliasEntries[i];
      if (!source.startsWith(alias, cursor)) continue;
      const after = cursor + alias.length;
      const beforeOk = cursor === 0 || source[cursor - 1] === ' ';
      const afterOk = after === source.length || source[after] === ' ';
      if (!beforeOk || !afterOk) continue;
      matchedAlias = alias;
      matchedKey = key;
      break;
    }

    if (matchedAlias && matchedKey) {
      if (keys[keys.length - 1] !== matchedKey) keys.push(matchedKey);
      cursor += matchedAlias.length;
      continue;
    }

    while (cursor < source.length && source[cursor] !== ' ') cursor += 1;
  }

  return keys;
}

function getColorAliases(requestedColor) {
  const key = normalizeForCompare(requestedColor);
  const colorKeys = extractColorKeysFromText(key);
  let aliases = [];

  if (colorKeys.length >= 2) {
    const compositeKey = colorKeys.slice(0, 2).join(' ');
    const compositeDisplay = colorKeys
      .slice(0, 2)
      .map((item) => COLOR_DISPLAY_LABEL_MAP[item] || item)
      .join(' ');
    aliases = [compositeKey, compositeDisplay];
  } else if (COLOR_ALIAS_MAP[key]) {
    aliases = COLOR_ALIAS_MAP[key];
  } else {
    aliases = [key];
  }

  const deduped = new Set();
  aliases.forEach((item) => {
    const raw = String(item || '').trim().toLowerCase();
    if (raw) deduped.add(raw);
    const normalized = normalizeForCompare(item);
    if (normalized) deduped.add(normalized);
  });
  return Array.from(deduped);
}

function escapeRegexText(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getColorDisplayLabel(requestedColor) {
  const key = normalizeForCompare(requestedColor);
  const colorKeys = extractColorKeysFromText(key);
  if (colorKeys.length >= 2) {
    return colorKeys
      .slice(0, 2)
      .map((item) => COLOR_DISPLAY_LABEL_MAP[item] || item)
      .join(' ');
  }
  return COLOR_DISPLAY_LABEL_MAP[key] || key || '';
}

function extractRequestedColor(question) {
  const q = normalizeForCompare(question);
  if (!q) return '';

  const scopedMatch = q.match(/(?:^|\s)(?:mau|color)\s+([a-z0-9\s]{2,60})/);
  const scopedText = scopedMatch && scopedMatch[1] ? scopedMatch[1] : q;
  const scopedKeys = extractColorKeysFromText(scopedText);
  if (scopedKeys.length >= 2) {
    return scopedKeys.slice(0, 2).join(' ');
  }
  if (scopedKeys.length === 1) {
    return scopedKeys[0];
  }

  const fullKeys = extractColorKeysFromText(q);
  if (fullKeys.length >= 2) {
    return fullKeys.slice(0, 2).join(' ');
  }
  if (fullKeys.length === 1) {
    return fullKeys[0];
  }

  return '';
}

function normalizeColor(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
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

  const requestedType = inferProductType(question);
  const filteredProducts = requestedType
    ? products.filter((item) => productMatchesRequestedType(item, requestedType.value))
    : products;
  if (!filteredProducts.length) return '';

  const picked = rankProductsBySpecificTerms(filteredProducts, question).slice(0, 3);
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
    .replace(/\b(?:https?:\/\/)?(?:www\.)?(?:website|example\.com|localhost(?::\d+)?)\/[^\s)]*/gi, '/products')
    .replace(/\/(?:top\s*selling|topselling|topseling)\b/gi, '/products');

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
  const acceptedTerms = new Set(getColorAliases(requestedColor).map(normalizeColor).filter(Boolean));
  const isColorMatched = (value) => {
    const normalized = normalizeColor(value);
    if (!normalized) return false;
    return Array.from(acceptedTerms).some((term) => {
      const escaped = escapeRegexText(term);
      return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(normalized);
    });
  };

  return products
    .map((p) => {
      const colorDetails = Array.isArray(p && p.mauSacChiTiet) ? p.mauSacChiTiet : [];
      const matchedDetails = colorDetails.filter((c) => isColorMatched(c && c.ten));
      const colorNames = Array.isArray(p && p.mauSacCoSan) ? p.mauSacCoSan : [];
      const matchedByNameOnly = colorNames.some((colorName) => isColorMatched(colorName));
      const matchedAny = matchedDetails.length > 0 || matchedByNameOnly;
      const hasSizeInMatchedColor = matchedDetails.length > 0
        ? matchedDetails.some((c) => Boolean(c && c.conSize))
        : Number(p && p.soluongton || 0) > 0;

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
// HÀM LAY SẢN PHẨM NHANH THEO MÀU SẮC ĐƯỢC NHẮC ĐẾN TRONG CÂU HỎI
async function getQuickProductsByColor({ question, requestedColor, limit = 8 }) {
  if (!requestedColor) return [];

  const typeMatch = inferProductType(question);
  const genderMatch = inferGender(question);
  const priceConstraint = extractPriceConstraint(question);

  const aliases = getColorAliases(requestedColor);
  const escapedAliases = aliases.map((item) => escapeRegexText(item).replace(/\s+/g, '\\s*'));
  const colorRegex = new RegExp(`(^|\\s)(${escapedAliases.join('|')})(\\s|$)`, 'i');

  const query = {
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] },
    $or: [
      { mausac_chinh: { $regex: colorRegex } },
      { 'bienthe.mausac': { $regex: colorRegex } }
    ]
  };

  if (typeMatch && typeMatch.value) {
    query.loaisanpham = typeMatch.value;
  }

  if (genderMatch && genderMatch.value) {
    query.gioitinh = genderMatch.value === 'unisex'
      ? { $in: ['unisex', 'nam', 'nu'] }
      : genderMatch.value;
  }

  const rows = await Sanpham.find(query)
    .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham mausac_chinh sizes bienthe ngaycapnhat ngaytao')
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .limit(200)
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

    const colorSet = new Set();
    const colorDetailMap = new Map();
    const upsertColorStatus = (colorName, hasStock) => {
      const key = String(colorName || '').trim();
      if (!key) return;
      colorSet.add(key);
      const existing = colorDetailMap.get(key);
      if (existing) {
        existing.conSize = existing.conSize || Boolean(hasStock);
      } else {
        colorDetailMap.set(key, { ten: key, conSize: Boolean(hasStock) });
      }
    };

    if (item && item.mausac_chinh) {
      upsertColorStatus(item.mausac_chinh, Number(item.soluongton || 0) > 0);
    }

    if (Array.isArray(item && item.bienthe)) {
      item.bienthe.forEach((variant) => {
        const variantColor = variant && variant.mausac ? String(variant.mausac).trim() : '';
        const variantHasStock = Boolean(
          variant
          && Array.isArray(variant.sizes)
          && variant.sizes.some((s) => s && Number(s.soluong || 0) > 0)
        );
        if (variantColor) upsertColorStatus(variantColor, variantHasStock);
      });
    }

    return {
      id: String(item && item._id || ''),
      tensanpham: String(item && item.tensanpham || 'Sản phẩm'),
      imageUrl: String(item && item.hinhanh || '/images/shopping.png'),
      url: item && item._id ? `/products/${item._id}` : '',
      gia: basePrice,
      giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice,
      gioitinh: String(item && item.gioitinh || ''),
      loaisanpham: String(item && item.loaisanpham || ''),
      soluongton: Number(item && item.soluongton || 0),
      mauSacCoSan: Array.from(colorSet).slice(0, 12),
      mauSacChiTiet: Array.from(colorDetailMap.values()).slice(0, 12)
    };
  });

  const matched = findProductsByRequestedColor({ products: mapped }, requestedColor)
    .map((entry) => String(entry && entry.product && entry.product.id || ''));
  const matchedSet = new Set(matched);
  const colorFiltered = mapped.filter((item) => matchedSet.has(String(item && item.id || '')));

  const filteredByPrice = colorFiltered.filter((item) =>
    matchPriceConstraint(Number(item && (item.giaSauGiam || item.gia) || 0), priceConstraint)
  );

  return filteredByPrice.slice(0, Math.max(1, Number(limit || 8)));
}

function isColorProductQuestion(question, requestedColor) {
  const q = normalizeForCompare(question);
  if (!q || !requestedColor) return false;
  if (/\bmau\b|\bcolor\b/.test(q)) return true;
  return /\b(mua|tim|xem|goi y|de xuat|san pham|ao|quan|vay|dam|giay|tui|phu kien)\b/.test(q);
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

function productMatchesRequestedType(product, requestedType) {
  const type = String(requestedType || '').trim().toLowerCase();
  if (!type) return true;

  const loai = normalizeForCompare(product && (product.loaisanpham || product.productType || product.type));
  const text = normalizeForCompare(
    `${product && (product.tensanpham || product.name) ? (product.tensanpham || product.name) : ''} ${product && product.url ? product.url : ''}`
  );

  const has = (...patterns) => patterns.some((pattern) => pattern.test(loai) || pattern.test(text));

  if (type === 'aokhoac') return has(/aokhoac/, /ao khoac/, /jacket/, /blazer/, /coat/, /outerwear/);
  if (type === 'ao') return has(/\bao\b/, /ao thun/, /shirt/, /tee/, /polo/, /hoodie/, /so mi/);
  if (type === 'quan') return has(/\bquan\b/, /jean/, /short/, /jogger/, /trouser/, /pants?/);
  if (type === 'vay') return has(/\bvay\b/, /dam/, /dress/, /skirt/);
  if (type === 'giay') return has(/\bgiay\b/, /sneaker/, /shoe/, /sandal/, /boot/);
  if (type === 'tui') return has(/\btui\b/, /tui xach/, /bag/, /handbag/);
  if (type === 'phukien') return has(/phu kien/, /accessor/, /that lung/, /mu/, /non/, /hat/, /cap/, /scarf/);

  return true;
}

function productMatchesRequestedGender(product, requestedGender) {
  const gender = String(requestedGender || '').trim().toLowerCase();
  if (!gender) return true;

  const productGender = normalizeForCompare(product && (product.gioitinh || product.gender));
  if (!productGender) return false;

  if (gender === 'unisex') return /unisex/.test(productGender);
  if (gender === 'nam') return /\bnam\b|unisex/.test(productGender);
  if (gender === 'nu') return /\bnu\b|unisex/.test(productGender);
  return true;
}

function shouldBlendTopSellingForQuestion(questionText) {
  const q = normalizeForCompare(questionText);
  if (!q) return false;
  return /\b(goi y|de xuat|tu van|ban chay|noi bat|xu huong|xem san pham|tim san pham|mau nao)\b/.test(q);
}

function toSuggestedProducts(context, answerText, questionText) {
  const byId = new Map();

  const push = (item) => {
    if (!item) return;
    const id = String(item.id || item._id || '').trim();
    if (!id || byId.has(id)) return;
    const finalPrice = Number(item.giaSauGiam || item.gia || 0);
    const originalPrice = Number(item.gia || 0);
    const hasDiscount = originalPrice > 0 && finalPrice > 0 && finalPrice < originalPrice;
    const rawImageUrl = String(item.imageUrl || item.hinhanh || item.image || '').trim();
    byId.set(id, {
      id,
      name: String(item.tensanpham || item.name || item.ten || 'Sản phẩm'),
      url: String(item.url || `/products/${id}`),
      imageUrl: rawImageUrl || '/images/shirt.png',
      productType: String(item.loaisanpham || item.productType || item.type || '').trim(),
      mauSacCoSan: Array.isArray(item.mauSacCoSan) ? item.mauSacCoSan.slice(0, 12) : [],
      mauSacChiTiet: Array.isArray(item.mauSacChiTiet) ? item.mauSacChiTiet.slice(0, 12) : [],
      price: finalPrice,
      originalPrice,
      hasDiscount,
      priceText: finalPrice > 0 ? `${finalPrice.toLocaleString('vi-VN')}đ` : '',
      originalPriceText: hasDiscount ? `${originalPrice.toLocaleString('vi-VN')}đ` : ''
    });
  };

  const contextProducts = Array.isArray(context && context.products) ? context.products : [];
  const includeTopSelling = contextProducts.length === 0 || shouldBlendTopSellingForQuestion(questionText);

  // Prefer products already matched by question/context first.
  contextProducts.forEach(push);
  if (includeTopSelling) {
    (Array.isArray(context && context.topSelling) ? context.topSelling : []).forEach(push);
  }
  (Array.isArray(context.lookbooks) ? context.lookbooks : []).forEach((lookbook) => {
    (Array.isArray(lookbook && lookbook.products) ? lookbook.products : []).forEach(push);
  });
  const priceConstraint = extractPriceConstraint(questionText);
  const candidates = Array.from(byId.values()).filter((item) => matchPriceConstraint(item.price, priceConstraint));
  if (candidates.length === 0) return [];

  const answerNorm = normalizeForCompare(answerText);

  if (answerNorm) {
    const mentionedIds = extractMentionedProductIds(answerText);
    const byMentionedId = candidates.filter((item) => mentionedIds.has(String(item.id || '').toLowerCase()));
    if (byMentionedId.length > 0) return byMentionedId.slice(0, 4);
  }

  const matched = answerNorm ? candidates.filter((item) => {
    const nameNorm = normalizeForCompare(item.name);
    if (!nameNorm) return false;
    if (answerNorm.includes(nameNorm)) return true;

    const tokens = nameNorm.split(' ').filter((token) => token.length >= 4);
    if (tokens.length === 0) return false;
    return tokens.some((token) => answerNorm.includes(token));
  }) : [];

  const baseList = matched.length > 0 ? matched : candidates;
  const requestedType = inferProductType(questionText);
  const typedList = requestedType
    ? baseList.filter((item) => productMatchesRequestedType(item, requestedType.value))
    : baseList;
  let effectiveList = typedList.length > 0 ? typedList : (requestedType ? [] : baseList);

  const requestedColor = extractRequestedColor(questionText);
  if (requestedColor) {
    const matchedByColor = findProductsByRequestedColor(
      {
        products: effectiveList.map((item) => ({
          id: item.id,
          mauSacCoSan: item.mauSacCoSan,
          mauSacChiTiet: item.mauSacChiTiet
        }))
      },
      requestedColor
    );
    const matchedIds = new Set((matchedByColor || []).map((entry) => String(entry && entry.product && entry.product.id || '')));
    const colorFilteredList = effectiveList.filter((item) => matchedIds.has(String(item.id || '')));
    if (colorFilteredList.length > 0) {
      effectiveList = colorFilteredList;
    } else if (isColorProductQuestion(questionText, requestedColor)) {
      return [];
    }
  }

  const rankedEffectiveList = rankProductsBySpecificTerms(effectiveList, questionText);

  const requestedGroups = detectRequestedGroups(questionText);
  if (requestedGroups.length === 0) {
    return rankedEffectiveList.slice(0, 4);
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
    const first = rankedEffectiveList.find((item) => productMatchesGroup(item, group));
    take(first);
  });

  rankedEffectiveList.forEach(take);
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
    const pageContext = normalizePageContext(req.body && req.body.pageContext);
    const pageCurrentProduct = pageContext && pageContext.currentProduct ? pageContext.currentProduct : null;

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

    const hasSpecificLookupTerms = extractSpecificProductQueryTerms(question).length > 0;
    if (
      pageCurrentProduct
      && isPriceLookupQuestionText(question)
      && (isCurrentProductReferenceQuestion(question) || !hasSpecificLookupTerms)
    ) {
      const productUrl = normalizeMessage(
        pageCurrentProduct.url
        || (pageCurrentProduct.id ? `/products/${pageCurrentProduct.id}` : '/products')
      );
      const hasFlashSale = Number(pageCurrentProduct.giaSauGiam || 0) > 0
        && Number(pageCurrentProduct.gia || 0) > Number(pageCurrentProduct.giaSauGiam || 0);

      return res.json({
        success: true,
        data: {
          answer: buildDirectPriceAnswer(pageCurrentProduct),
          model: 'page-context',
          provider: 'system',
          suggestedProducts: [toSuggestedCard(pageCurrentProduct)],
          suggestedActions: [{
            label: 'Xem san pham',
            url: productUrl || '/products',
            kind: 'primary'
          }],
          contextMeta: buildQuickContextMeta({
            products: 1,
            hasFlashSale
          })
        }
      });
    }
// Kết quả tìm nhanh
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

    const quickFlashSale = await getQuickFlashSalePayload(question);
    if (quickFlashSale && quickFlashSale.answer) {
      return res.json({
        success: true,
        data: {
          answer: quickFlashSale.answer,
          model: 'db-fast-path',
          provider: 'system',
          suggestedProducts: Array.isArray(quickFlashSale.suggestedProducts) ? quickFlashSale.suggestedProducts : [],
          suggestedActions: Array.isArray(quickFlashSale.suggestedActions) ? quickFlashSale.suggestedActions : [],
          contextMeta: quickFlashSale.contextMeta || buildQuickContextMeta()
        }
      });
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
//Thương hiệu nhanh
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
//Gợi ý phối đồ nhanh
    if (isOutfitSuggestionQuestion(question, pageCurrentProduct)) {
      const quickOutfit = await getQuickOutfitSuggestionPayload({
        question,
        userId: req.user && req.user._id ? req.user._id : null,
        pageCurrentProduct,
        imageProducts,
        imageMeta,
        pageContext
      });

      if (quickOutfit && quickOutfit.answer) {
        return res.json({
          success: true,
          data: {
            answer: quickOutfit.answer,
            model: 'db-outfit-path',
            provider: 'system',
            suggestedProducts: Array.isArray(quickOutfit.suggestedProducts) ? quickOutfit.suggestedProducts : [],
            suggestedActions: Array.isArray(quickOutfit.suggestedActions) ? quickOutfit.suggestedActions : [],
            contextMeta: quickOutfit.contextMeta || buildQuickContextMeta()
          }
        });
      }
    }
//
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
      const typeMatch = inferProductType(question);
      const genderMatch = inferGender(question);
      const priceFilters = {
        ...(typeMatch && typeMatch.value ? { loaisanpham: typeMatch.value } : {}),
        ...(genderMatch && genderMatch.value ? { gioitinh: genderMatch.value } : {})
      };
      const quickProducts = await getQuickProductsByPriceConstraint(question, priceConstraint);
      if (quickProducts.length > 0) {
        const listUrl = buildPriceListUrlFromConstraint(priceConstraint, priceFilters);
        return res.json({
          success: true,
          data: {
            answer: buildQuickPriceListingAnswer(quickProducts, priceConstraint, priceFilters),
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
    const requestedColorFromQuestion = extractRequestedColor(question);

    const context = await buildDataContext({
      question,
      userId: req.user && req.user._id ? req.user._id : null,
      useOpenClip: shouldUseSemanticProductSearch
    });

    mergeImageProductsIntoContext(context, imageProducts, imageMeta, question);
    mergePageProductIntoContext(context, pageContext);

    if (isStockAvailabilityQuestion(question)) {
      const requestedSizes = extractRequestedSizes(question);
      const stockTarget = pickStockLookupProduct({
        question,
        context,
        pageCurrentProduct
      });

      if (stockTarget && (stockTarget.id || stockTarget._id)) {
        const stockProduct = await Sanpham.findById(stockTarget.id || stockTarget._id)
          .select('_id tensanpham hinhanh soluongton sizes bienthe')
          .lean();

        if (stockProduct) {
          const answer = buildSpecificStockAnswer(stockProduct, requestedSizes);
          const productUrl = `/products/${stockProduct._id}`;
          const variantImage = Array.isArray(stockProduct.bienthe)
            ? (stockProduct.bienthe.find((item) => item && item.hinhanh) || {}).hinhanh
            : '';
          const productCard = {
            id: String(stockProduct._id || ''),
            tensanpham: String(stockProduct.tensanpham || 'Sản phẩm'),
            imageUrl: String(stockProduct.hinhanh || variantImage || '/images/shopping.png'),
            url: productUrl
          };

          const suggestedActions = await buildSuggestedActions({
            question,
            context
          });
          pushUniqueAction(suggestedActions, {
            label: 'Xem sản phẩm',
            url: productUrl,
            kind: 'primary'
          });

          return res.json({
            success: true,
            data: {
              answer,
              model: 'db-stock-path',
              provider: 'system',
              suggestedProducts: [toSuggestedCard(productCard)],
              suggestedActions,
              contextMeta: buildQuickContextMeta({
                products: 1,
                hasFlashSale: false
              })
            }
          });
        }
      }

      const suggestedActions = await buildSuggestedActions({
        question,
        context
      });
      return res.json({
        success: true,
        data: {
          answer: buildAmbiguousStockAnswer(question, requestedSizes),
          model: 'db-stock-path-clarify',
          provider: 'system',
          suggestedProducts: [],
          suggestedActions,
          contextMeta: buildQuickContextMeta({
            products: Array.isArray(context && context.products) ? context.products.length : 0,
            hasFlashSale: false
          })
        }
      });
    }

    if (isColorProductQuestion(question, requestedColorFromQuestion)) {
      const colorProducts = await getQuickProductsByColor({
        question,
        requestedColor: requestedColorFromQuestion,
        limit: 8
      });

      const colorContext = {
        products: colorProducts,
        topSelling: []
      };

      if (colorProducts.length > 0) {
        const answerByColor = buildColorAvailabilityAnswer(colorContext, requestedColorFromQuestion)
          || buildAvailableProductsAnswer(colorContext, question)
          || 'Shop hiện có sản phẩm đúng màu bạn cần.';

        const suggestedActions = await buildSuggestedActions({
          question,
          context: {
            ...(context || {}),
            products: colorProducts
          }
        });

        return res.json({
          success: true,
          data: {
            answer: answerByColor,
            model: 'db-color-path',
            provider: 'system',
            suggestedProducts: toSuggestedProducts(colorContext, answerByColor, question),
            suggestedActions,
            contextMeta: buildQuickContextMeta({
              products: colorProducts.length,
              hasFlashSale: colorProducts.some((item) => Number(item.giaSauGiam || 0) > 0 && Number(item.gia || 0) > Number(item.giaSauGiam || 0))
            })
          }
        });
      }

      const requestedColorLabel = getColorDisplayLabel(requestedColorFromQuestion);
      const noColorAnswer = `Hiện mình chưa tìm thấy sản phẩm đúng màu ${requestedColorLabel} theo bộ lọc hiện tại. Bạn muốn mình mở rộng thêm kiểu dáng hoặc mức giá để tìm lại không?`;
      return res.json({
        success: true,
        data: {
          answer: noColorAnswer,
          model: 'db-color-path',
          provider: 'system',
          suggestedProducts: [],
          suggestedActions: [
            {
              label: 'Xem sản phẩm',
              url: buildProductsUrl({ keyword: requestedColorLabel || requestedColorFromQuestion }),
              kind: 'primary'
            }
          ],
          contextMeta: buildQuickContextMeta({ products: 0, hasFlashSale: false })
        }
      });
    }

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
    const requestedColor = requestedColorFromQuestion;
    answer = sanitizeBadLinksInAnswer(answer);

    // When user asks by color, prefer deterministic DB-based answer over generative text.
    if (isColorProductQuestion(question, requestedColor)) {
      const colorFirstAnswer = buildColorAvailabilityAnswer(context, requestedColor);
      if (colorFirstAnswer) {
        answer = colorFirstAnswer;
      }
    }

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
    const hasContextProducts = Array.isArray(context.products) && context.products.length > 0;
    const hasPriceConstraint = Boolean(extractPriceConstraint(question));
    const answerHasProductId = extractMentionedProductIds(answer).size > 0;
    const shouldShowCards = shouldUseSemanticProductSearch
      || hasLookbookProducts
      || (hasContextProducts && (hasPriceConstraint || answerHasProductId));
    let suggestedProducts = shouldShowCards
      ? toSuggestedProducts(context, answer, question)
      : [];

    if (suggestedProducts.length === 0 && answerHasProductId) {
      const mentionedIds = Array.from(extractMentionedProductIds(answer)).slice(0, 8);
      if (mentionedIds.length > 0) {
        const linkedProducts = await Sanpham.find({
          _id: { $in: mentionedIds },
          daxoa: { $ne: true },
          trangthai: { $in: ['active', 'dangban'] }
        })
          .select('_id tensanpham hinhanh gia phantramgiamgia loaisanpham gioitinh')
          .lean();

        const byId = new Map();
        linkedProducts.forEach((item) => {
          const key = String(item && item._id || '').toLowerCase();
          if (!key) return;
          byId.set(key, item);
        });

        const orderedLinkedProducts = mentionedIds
          .map((id) => byId.get(String(id || '').toLowerCase()))
          .filter(Boolean)
          .map((item) => {
            const basePrice = Number(item && item.gia || 0);
            const percent = Number(item && item.phantramgiamgia || 0);
            const currentPrice = basePrice > 0 && percent > 0
              ? Math.round(basePrice * (1 - percent / 100))
              : basePrice;
            return {
              id: String(item && item._id || ''),
              tensanpham: String(item && item.tensanpham || 'Sản phẩm'),
              imageUrl: String(item && item.hinhanh || '/images/shirt.png'),
              url: item && item._id ? `/products/${item._id}` : '',
              gia: basePrice,
              giaSauGiam: currentPrice > 0 ? currentPrice : basePrice,
              loaisanpham: String(item && item.loaisanpham || ''),
              gioitinh: String(item && item.gioitinh || '')
            };
          });

        suggestedProducts = orderedLinkedProducts.slice(0, 4).map(toSuggestedCard);
      }
    }

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


