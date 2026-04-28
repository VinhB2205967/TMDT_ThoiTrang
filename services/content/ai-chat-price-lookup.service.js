const { Sanpham, FlashSale } = require('../../models');

const SPECIFIC_PRODUCT_LOOKUP_STOPWORDS = new Set([
  'gia', 'bao', 'nhieu', 'tien', 'cua', 'la', 'ban', 'shop', 'co', 'khong',
  'san', 'pham', 'cho', 'toi', 'minh', 'em', 'anh', 'chi', 'giup', 'xin',
  'hoi', 've', 'xem', 'duoc', 'nay', 'kia', 'ma', 'mau', 'size', 'ao',
  'quan', 'vay', 'dam', 'tui', 'giay', 'dep', 'mu', 'non', 'phu', 'kien',
  'sp', 'item', 'model'
]);

const GENERIC_PRODUCT_TOKENS = new Set([
  'ao', 'quan', 'vay', 'dam', 'tui', 'giay', 'dep', 'mu', 'non', 'phu',
  'kien', 'san', 'pham', 'thoi', 'trang'
]);

// Chuẩn hóa chuỗi để so khớp không dấu và ổn định ký tự.
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

// Escape ký tự đặc biệt để dựng regex an toàn.
function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Định dạng tiền VND cho câu trả lời chat.
function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}\u0111`;
}

// Kiểm tra câu hỏi có thuộc intent hỏi giá hay không.
function isPriceLookupQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;
  return /\bgia\b|\bgia cua\b|\bgia ban\b|\bmuc gia\b|\bbao nhieu tien\b|\bla bao nhieu\b/.test(q);
}

// Tách từ khóa sản phẩm cụ thể từ câu hỏi hỏi giá.
function extractSpecificProductLookupTerms(question) {
  const normalized = normalizeForCompare(question)
    .replace(/\bgia\s+cua\b/g, ' ')
    .replace(/\bgia\s+ban\b/g, ' ')
    .replace(/\bmuc\s+gia\b/g, ' ')
    .replace(/\bbao\s+nhieu\s+tien\b/g, ' ')
    .replace(/\bla\s+bao\s+nhieu\b/g, ' ')
    .replace(/\bgia\b/g, ' ');

  if (!normalized) return [];

  return Array.from(new Set(
    normalized
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && !SPECIFIC_PRODUCT_LOOKUP_STOPWORDS.has(item))
  )).slice(0, 6);
}

// Xác định đây có phải truy vấn giá của sản phẩm cụ thể hay không.
function isSpecificProductPriceLookup(question) {
  if (!isPriceLookupQuestion(question)) return false;
  const terms = extractSpecificProductLookupTerms(question);
  return terms.length >= 2 && terms.some((term) => term.length >= 4);
}

// Lấy giá hiện tại tốt nhất từ dữ liệu sản phẩm/biến thể.
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

// Lấy map flash sale đang hiệu lực theo danh sách sản phẩm.
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

// Áp flash sale vào giá hiện tại để ra giá thấp nhất hợp lệ.
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

// Chấm điểm mức độ khớp giữa sản phẩm và câu hỏi người dùng.
function scoreProductCandidateForQuestion(product, questionNorm, lookupTerms) {
  const nameNorm = normalizeForCompare(product && product.tensanpham);
  if (!nameNorm) {
    return { score: 0, matchedCount: 0, longMatchedCount: 0 };
  }

  const matchedTerms = lookupTerms.filter((term) => nameNorm.includes(term));
  const matchedCount = matchedTerms.length;
  if (matchedCount === 0) {
    return { score: 0, matchedCount: 0, longMatchedCount: 0 };
  }

  const longMatchedCount = matchedTerms.filter((term) => term.length >= 4).length;
  const compactName = nameNorm
    .split(' ')
    .filter((token) => token && !GENERIC_PRODUCT_TOKENS.has(token))
    .join(' ');

  let score = matchedCount * 6 + longMatchedCount * 4;
  if (matchedCount === lookupTerms.length) score += 12;
  if (questionNorm.includes(nameNorm)) score += 20;
  else if (compactName && questionNorm.includes(compactName)) score += 16;
  if (compactName && matchedCount >= 2) score += 6;

  return {
    score,
    matchedCount,
    longMatchedCount
  };
}

// Chọn sản phẩm khớp nhất từ danh sách candidate.
function pickBestMatchedProduct(question, products, lookupTerms) {
  const questionNorm = normalizeForCompare(question);
  const ranked = (Array.isArray(products) ? products : [])
    .map((product) => ({
      product,
      ...scoreProductCandidateForQuestion(product, questionNorm, lookupTerms)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
      return b.longMatchedCount - a.longMatchedCount;
    });

  const best = ranked[0] || null;
  const second = ranked[1] || null;
  if (!best) return null;

  const strictEnough = lookupTerms.length <= 2
    ? best.matchedCount === lookupTerms.length
    : best.matchedCount >= 2;

  if (!strictEnough || best.longMatchedCount < 1) return null;
  if (!second) return best.product;

  if (best.score - second.score >= 2 || best.matchedCount > second.matchedCount) {
    return best.product;
  }

  const bestName = normalizeForCompare(best.product && best.product.tensanpham);
  const secondName = normalizeForCompare(second.product && second.product.tensanpham);

  // Allow deterministic pick when there are duplicate records with same product name.
  if (bestName && secondName && bestName === secondName) {
    return best.product;
  }

  if (best.matchedCount === lookupTerms.length) {
    return best.product;
  }

  return null;
}

// Tìm nhanh sản phẩm được hỏi giá trực tiếp từ DB.
async function findDirectPriceMatchFast(question) {
  const isSpecific = isSpecificProductPriceLookup(question);
  const lookupTerms = extractSpecificProductLookupTerms(question);
  if (!isSpecific) {
    return { isSpecific: false, lookupTerms, product: null };
  }

  const strictBaseFilter = {
    daxoa: { $ne: true },
    trangthai: { $in: ['active', 'dangban'] }
  };
  const looseBaseFilter = {
    daxoa: { $ne: true }
  };
  const productFields = '_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe ngaycapnhat ngaytao';
  const buildNameClause = (term) => ({ tensanpham: new RegExp(escapeRegex(term), 'i') });
  const normalizedFilterRows = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    if (lookupTerms.length === 0) return list;

    const withAllTerms = list.filter((item) => {
      const normName = normalizeForCompare(item && item.tensanpham);
      return lookupTerms.every((term) => normName.includes(term));
    });
    if (withAllTerms.length > 0) return withAllTerms;

    return list.filter((item) => {
      const normName = normalizeForCompare(item && item.tensanpham);
      return lookupTerms.some((term) => normName.includes(term));
    });
  };

  const fetchRows = async (baseFilter) => {
    let rows = await Sanpham.find({
      ...baseFilter,
      $and: lookupTerms.map(buildNameClause)
    })
      .select(productFields)
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(8)
      .lean({ virtuals: true });

    if ((!rows || rows.length === 0) && lookupTerms.length > 0) {
      rows = await Sanpham.find({
        ...baseFilter,
        $or: lookupTerms.map(buildNameClause)
      })
        .select(productFields)
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(12)
      .lean({ virtuals: true });
    }

    if ((!rows || rows.length === 0) && lookupTerms.length > 0) {
      const broadRows = await Sanpham.find(baseFilter)
        .select(productFields)
        .sort({ ngaycapnhat: -1, ngaytao: -1 })
        .limit(280)
        .lean({ virtuals: true });
      rows = normalizedFilterRows(broadRows).slice(0, 24);
    }

    return rows;
  };

  let rows = await fetchRows(strictBaseFilter);
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = await fetchRows(looseBaseFilter);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { isSpecific: true, lookupTerms, product: null };
  }

  const flashMap = await getActiveFlashSalePriceMap(rows.map((item) => item && item._id));
  const products = rows.map((item) => {
    const basePrice = Number(item && item.gia || 0);
    const currentPrice = getCurrentPriceFromRecord(item);
    const finalPrice = applyFlashSaleToCurrentPrice({
      record: item,
      currentPrice,
      flashEntry: flashMap.get(String(item && item._id || ''))
    });

    return {
      id: String(item && item._id || ''),
      tensanpham: String(item && item.tensanpham || 'San pham'),
      imageUrl: String(item && item.hinhanh || '/images/shopping.png'),
      url: item && item._id ? `/products/${item._id}` : '',
      gia: basePrice,
      giaSauGiam: finalPrice > 0 ? finalPrice : currentPrice,
      phantramgiamgia: Number(item && item.phantramgiamgia || 0),
      soluongton: Number(item && item.soluongton || 0),
      gioitinh: String(item && item.gioitinh || ''),
      loaisanpham: String(item && item.loaisanpham || '')
    };
  });

  return {
    isSpecific: true,
    lookupTerms,
    product: pickBestMatchedProduct(question, products, lookupTerms)
  };
}

// Tìm sản phẩm hỏi giá trong context đã có sẵn ở phiên chat.
function findDirectPriceMatchInContext(question, context) {
  const isSpecific = isSpecificProductPriceLookup(question);
  const lookupTerms = extractSpecificProductLookupTerms(question);
  if (!isSpecific) {
    return { isSpecific: false, lookupTerms, product: null };
  }

  const candidates = [];
  const seen = new Set();

  const pushUnique = (item) => {
    if (!item || typeof item !== 'object') return;
    const id = String(item.id || item._id || '').trim();
    const name = String(item.tensanpham || item.name || '').trim();
    const url = String(item.url || '').trim();
    const key = [id, url, normalizeForCompare(name)].find(Boolean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id,
      tensanpham: name,
      url,
      imageUrl: String(item.imageUrl || item.image || '').trim(),
      gia: Number(item.gia || item.originalPrice || 0),
      giaSauGiam: Number(item.giaSauGiam || item.price || item.gia || 0),
      phantramgiamgia: Number(item.phantramgiamgia || 0)
    });
  };

  (Array.isArray(context && context.products) ? context.products : []).forEach(pushUnique);
  (Array.isArray(context && context.topSelling) ? context.topSelling : []).forEach(pushUnique);
  (Array.isArray(context && context.lookbooks) ? context.lookbooks : []).forEach((lookbook) => {
    (Array.isArray(lookbook && lookbook.products) ? lookbook.products : []).forEach(pushUnique);
  });

  return {
    isSpecific: true,
    lookupTerms,
    product: pickBestMatchedProduct(question, candidates, lookupTerms)
  };
}

// Dựng câu trả lời khi đã tìm thấy đúng sản phẩm cần báo giá.
function buildDirectPriceAnswer(product) {
  const item = product && typeof product === 'object' ? product : {};
  const name = String(item.tensanpham || item.name || 'San pham').trim();
  const currentPrice = Number(item.giaSauGiam || item.price || item.gia || 0);
  const originalPrice = Number(item.gia || item.originalPrice || 0);
  const hasDiscount = currentPrice > 0 && originalPrice > currentPrice;
  const link = String(item.url || (item.id ? `/products/${item.id}` : '')).trim();

  if (currentPrice <= 0) {
    return [
      `M\u00ecnh \u0111\u00e3 t\u00ecm th\u1ea5y ${name}, nh\u01b0ng hi\u1ec7n ch\u01b0a c\u00f3 gi\u00e1 hi\u1ec3n th\u1ecb r\u00f5 r\u00e0ng.`,
      link ? `B\u1ea1n xem chi ti\u1ebft t\u1ea1i \u0111\u00e2y: ${link}` : ''
    ].filter(Boolean).join('\n');
  }

  return [
    `Gi\u00e1 hi\u1ec7n t\u1ea1i c\u1ee7a ${name} l\u00e0 ${formatMoney(currentPrice)}.`,
    hasDiscount ? `Gi\u00e1 g\u1ed1c l\u00e0 ${formatMoney(originalPrice)}.` : '',
    link ? `B\u1ea1n xem chi ti\u1ebft t\u1ea1i \u0111\u00e2y: ${link}` : ''
  ].filter(Boolean).join('\n');
}

// Dựng câu trả lời fallback khi không tìm thấy sản phẩm cụ thể.
function buildSpecificProductNotFoundAnswer(lookupTerms) {
  const keyword = Array.isArray(lookupTerms) ? lookupTerms.join(' ') : '';
  const params = new URLSearchParams();
  if (keyword) params.set('keyword', keyword);
  const query = params.toString();
  const searchUrl = query ? `/products?${query}` : '/products';

  return [
    'M\u00ecnh ch\u01b0a t\u00ecm th\u1ea5y \u0111\u00fang s\u1ea3n ph\u1ea9m b\u1ea1n h\u1ecfi trong d\u1eef li\u1ec7u hi\u1ec7n t\u1ea1i.',
    keyword
      ? `B\u1ea1n th\u1eed t\u00ecm v\u1edbi t\u1eeb kh\u00f3a "${keyword}" t\u1ea1i: ${searchUrl}`
      : `B\u1ea1n c\u00f3 th\u1ec3 xem danh s\u00e1ch s\u1ea3n ph\u1ea9m t\u1ea1i: ${searchUrl}`
  ].join('\n');
}

module.exports = {
  findDirectPriceMatchFast,
  findDirectPriceMatchInContext,
  buildDirectPriceAnswer,
  buildSpecificProductNotFoundAnswer
};
