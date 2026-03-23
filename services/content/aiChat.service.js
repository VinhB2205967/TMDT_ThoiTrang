const mongoose = require('mongoose');
const {
  Sanpham,
  Danhmuc,
  Brand,
  FlashSale,
  Donhang,
  Chitietdonhang,
  Nguoidung,
  Danhgia,
  Yeuthich,
  Thanhtoan,
  Coupon,
  UserVoucher,
  LoginLog,
  PhieuXuatKho,
  TonKhoLo,
  SizeGuide,
  Lookbook,
  HomeSection,
  Setting
} = require('../../models');
const ImportReceipt = require('../../models/import_receipt_model');
const { rankProductsByQuery } = require('../catalog/openClip.service.js');

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 30000);
const OLLAMA_NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT || 140);
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || '30m';
const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemma-3-12b-it';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 30000);
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 512);
const GEMINI_ALLOWED_MODELS = [
  'gemma-3-4b-it',
  'gemma-3-12b-it',
  'gemma-3-27b-it',
  'gemini-2.5-flash'
];
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-3-12b-it:free';
const OPENROUTER_FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || 'google/gemini-2.5-flash';
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 30000);
const OPENROUTER_MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS || 512);
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || 'http://localhost:3000';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'FashionStore AI Chat';

function getOpenRouterBaseUrl() {
  const key = String(OPENROUTER_API_KEY || '').trim();
  const configured = String(OPENROUTER_API_URL || '').trim();
  if (configured && configured !== 'https://openrouter.ai/api/v1') return configured;
  if (key.startsWith('rqsty-')) return 'https://router.requesty.ai/v1';
  return 'https://openrouter.ai/api/v1';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function toSafeRegex(text) {
  const escaped = String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

function compactWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function isGeminiTransientError(message) {
  const m = String(message || '').toLowerCase();
  return m.includes('high demand')
    || m.includes('try again later')
    || m.includes('rate limit')
    || m.includes('resource exhausted')
    || m.includes('temporarily unavailable')
    || m.includes('deadline exceeded')
    || m.includes('timed out')
    || m.includes('timeout')
    || m.includes('this operation was aborted');
}

function isOllamaInsufficientMemoryError(message) {
  const m = String(message || '').toLowerCase();
  return m.includes('requires more system memory')
    || (m.includes('system memory') && m.includes('available'))
    || m.includes('insufficient memory');
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
  const q = normalizeText(question)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

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

async function getActiveFlashSalePriceMap(productIds) {
  const ids = Array.isArray(productIds)
    ? productIds.map((id) => String(id || '')).filter(Boolean)
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
      const id = String(entry && entry.sanpham_id || '');
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
  return Math.min(...priceCandidates.filter((v) => Number.isFinite(v) && v > 0));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '/images/shopping.png';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
  return `/${raw.replace(/^\/+/, '')}`;
}

function normalizeInternalPath(pathValue) {
  const path = String(pathValue || '').trim();
  if (!path) return '';

  const norm = path
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  if (norm.includes('/orders') || norm.includes('don hang') || norm.includes('/don-hang')) return '/orders';
  if (norm.includes('/vouchers') || norm.includes('/voucher')) return '/vouchers';
  if (norm.includes('/size-guide') || norm.includes('bang size') || norm.includes('/size')) return '/size-guide';
  if (norm.includes('/cart') || norm.includes('gio hang') || norm.includes('/gio-hang')) return '/cart';

  const idMatch = path.match(/([a-f0-9]{24})/i);
  if (idMatch) return `/products/${idMatch[1]}`;
  return '';
}

function humanizeReply(text) {
  let output = String(text || '').trim();
  if (!output) return output;

  output = output
    .replace(/theo du lieu\s+sizeguides\s+trong\s+json[:,]?/gi, '')
    .replace(/theo dữ liệu\s+sizeguides\s+trong\s+json[:,]?/gi, '')
    .replace(/trong\s+json[:,]?/gi, '')
    .replace(/\bcontext\b/gi, 'dữ liệu hiện có')
    .replace(/\bsizeguides\b/gi, 'bảng size')
    .replace(/\bmyorders\b/gi, 'đơn hàng của bạn')
    .replace(/\bmyvouchers\b/gi, 'voucher của bạn')
    .replace(/https?:\/\/(?:www\.)?(?:website|example\.com|localhost(?::\d+)?)(\/[\w\-À-ỹ\/%]*)?/gi, (_, path) => normalizeInternalPath(path))
    .replace(/\bwebsite\/(orders|products|vouchers|size-guide|cart)\b/gi, (_, segment) => normalizeInternalPath(`/${segment}`));

  // Normalize malformed internal size-guide paths generated by AI.
  output = output
    .replace(/\/\s*(?:bang|bảng)\s*size\b/gi, '/size-guide')
    .replace(/\/size\s*guide\b/gi, '/size-guide')
    .replace(/\/size\b(?!-guide)/gi, '/size-guide');

  return output.replace(/\s{2,}/g, ' ').trim();
}

function buildSystemPrompt() {
  return [
    'Bạn là trợ lý AI của website bán thời trang.',
'Vai trò của bạn là hỗ trợ khách hàng như một nhân viên tư vấn bán hàng chuyên nghiệp.',
'Luôn trả lời bằng tiếng Việt có dấu, câu ngắn gọn, rõ ràng, tự nhiên như nhân viên tư vấn trong cửa hàng.',
'Giữ giọng điệu thân thiện, lịch sự, dễ hiểu.',

'Chỉ được trả lời dựa trên dữ liệu được cung cấp.',
'TUYỆT ĐỐI không được tự tạo thông tin nếu dữ liệu không có.',
'Không suy đoán, không bịa thêm chi tiết.',

'Nếu không đủ dữ liệu để trả lời, hãy nói rõ là hiện chưa có thông tin.',
'Sau đó hướng dẫn người dùng xem các trang phù hợp trên website như: sản phẩm, voucher, bảng size, giỏ hàng hoặc đơn hàng.',

'Khi người dùng hỏi về đơn hàng của họ, chỉ được sử dụng dữ liệu đơn hàng cá nhân của họ.',
'Không suy đoán hoặc tạo thêm đơn hàng không tồn tại.',
'Nếu không tìm thấy đơn hàng, hãy hướng dẫn người dùng kiểm tra trang đơn hàng.',

'Khi người dùng hỏi về voucher của họ, chỉ được sử dụng dữ liệu voucher cá nhân của họ.',
'Không được tự tạo voucher hoặc thông tin giảm giá.',

'Khi tư vấn size sản phẩm, ưu tiên dựa vào bảng size và size còn sẵn của sản phẩm.',
'Nếu chưa đủ thông tin để tư vấn size chính xác, hãy hỏi thêm chiều cao hoặc cân nặng của khách.',

'Khi người dùng hỏi về đánh giá sản phẩm, ưu tiên dựa vào các đánh giá và sản phẩm được đánh giá cao.',
'Không tự tạo đánh giá nếu dữ liệu không có.',

'Khi người dùng hỏi về sản phẩm bán chạy, xu hướng hoặc thống kê, ưu tiên sử dụng dữ liệu thống kê và sản phẩm bán chạy.',

'Khi sản phẩm có giảm giá, luôn ưu tiên dùng giá đã giảm làm giá chính để tư vấn.',
'Chỉ nêu thêm giá gốc khi cần so sánh, không được báo giá gốc thành giá hiện tại.',

'Khi người dùng hỏi tư vấn mua hàng theo mùa hoặc dịp (ví dụ: mùa hè, mùa đông, đi biển, đi tiệc...).',
'Chỉ được gợi ý các sản phẩm thực sự phù hợp với mùa hoặc dịp đó.',

'Nếu không có sản phẩm phù hợp với mùa hoặc dịp được hỏi, phải nói rõ là hiện chưa có.',
'Không được gợi ý sản phẩm không liên quan. và gửi các đường link không liên quan',
'Nếu cần đưa link, chỉ dùng đường dẫn nội bộ của website: /orders, /products/{id}, /vouchers, /size-guide, /cart.',
'Không dùng domain giả hoặc link mẫu như https://website/...',

'Mỗi lần chỉ gợi ý tối đa 4 sản phẩm tiêu biểu.',
'Nếu có nhiều sản phẩm phù hợp, hãy chọn những sản phẩm nổi bật nhất.',

'TUYỆT ĐỐI không nhắc tới tên biến, cấu trúc dữ liệu hoặc thuật ngữ kỹ thuật.',
'Không được nhắc đến các từ như JSON, context, products, vouchers, sizeGuides, database hoặc API.',

'Không giải thích cách hệ thống hoạt động.',
'Chỉ trả lời kết quả cuối cùng cho người dùng như một nhân viên tư vấn thực sự.'
  ].join(' ');
}

function resolveSystemPrompt(systemPrompt) {
  const custom = compactWhitespace(systemPrompt);
  return custom || buildSystemPrompt();
}

function mapProductPriceForAI(item) {
  const product = item && typeof item === 'object' ? item : {};
  const originalPrice = Number(product.gia || 0);
  const discountedPrice = Number(product.giaSauGiam || 0);
  const displayPrice = discountedPrice > 0 ? discountedPrice : originalPrice;
  const hasDiscount = originalPrice > 0 && displayPrice > 0 && displayPrice < originalPrice;

  return {
    ...product,
    gia: displayPrice,
    giaSauGiam: displayPrice,
    giaGoc: originalPrice,
    coGiamGia: hasDiscount
  };
}

function buildModelContext(context) {
  const base = context && typeof context === 'object' ? context : {};
  return {
    ...base,
    products: Array.isArray(base.products) ? base.products.map(mapProductPriceForAI) : [],
    topSelling: Array.isArray(base.topSelling) ? base.topSelling.map(mapProductPriceForAI) : []
  };
}

function takeRecentMessages(messages, limit = 8) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-limit)
    .map((item) => ({
      role: item && item.role === 'assistant' ? 'assistant' : 'user',
      content: compactWhitespace(item && item.content)
    }))
    .filter((item) => item.content);
}

function buildSearchTerms(question) {
  let normalized = normalizeText(question).toLowerCase();
  // Avoid treating age intent phrase ("từ ... tuổi trở lên") as lexical product keywords.
  normalized = normalized
    .replace(/trở\s+lên/gi, ' ')
    .replace(/tro\s+len/gi, ' ');
  if (!normalized) return [];

  const stopWords = new Set([
    'la', 'là', 'co', 'có', 'khong', 'không', 'toi', 'tôi', 'can', 'cần',
    'tim', 'tìm', 'cho', 'xin', 'nhe', 'nhé', 'giup', 'giúp', 've', 'về',
    'san', 'pham', 'sản', 'phẩm', 'bao', 'nhieu', 'nhiêu', 'gia', 'giá',
    'duoc', 'được', 'khuyen', 'nghi', 'gợi', 'ý', 'coi', 'xem',
    'duoi', 'dưới', 'tren', 'trên', 'tu', 'từ', 'den', 'đến', 'toi', 'tới',
    'khoang', 'khoảng', 'tam', 'tầm', 'gia re', 'gia rẻ', 're', 'rẻ',
    'tuoi', 'tuổi', 'nam tuoi', 'năm tuổi', 'be', 'bé', 'tre', 'trẻ'
  ]);

  const accentedTerms = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !stopWords.has(item) && !/^\d+$/.test(item));

  const asciiTerms = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !stopWords.has(item) && !/^\d+$/.test(item));

  return Array.from(new Set([...accentedTerms, ...asciiTerms])).slice(0, 8);
}

function extractProductIntent(question) {
  const q = normalizeText(question).toLowerCase();
  const seasonTerms = [];
  const occasionTerms = [];

  const seasonMap = [
    { key: 'xuan', patterns: [/\bxuan\b/, /xuân/] },
    { key: 'ha', patterns: [/\bha\b/, /hạ/, /he/, /hè/] },
    { key: 'thu', patterns: [/\bthu\b/, /thu$/i] },
    { key: 'dong', patterns: [/\bdong\b/, /đông/] }
  ];

  const occasionMap = [
    { key: 'di choi', patterns: [/di\s*choi/, /đi\s*chơi/] },
    { key: 'di lam', patterns: [/di\s*lam/, /đi\s*làm/] },
    { key: 'du tiec', patterns: [/du\s*tiec/, /dự\s*tiệc/] },
    { key: 'the thao', patterns: [/the\s*thao/, /thể\s*thao/] },
    { key: 'o nha', patterns: [/o\s*nha/, /ở\s*nhà/] }
  ];

  seasonMap.forEach((item) => {
    if (item.patterns.some((p) => p.test(q))) seasonTerms.push(item.key);
  });

  occasionMap.forEach((item) => {
    if (item.patterns.some((p) => p.test(q))) occasionTerms.push(item.key);
  });

  return {
    seasonTerms: Array.from(new Set(seasonTerms)),
    occasionTerms: Array.from(new Set(occasionTerms))
  };
}

function relatedKeywordsBySeason(seasonTerms) {
  const map = {
    dong: ['aokhoac', 'áo khoác', 'hoodie', 'len', 'nỉ', 'ni', 'varsity', 'jacket'],
    ha: ['thun', 'áo thun', 'sơ mi', 'so mi', 'short', 'váy', 'vay', 'mỏng', 'mong'],
    xuan: ['sơ mi', 'so mi', 'cardigan', 'blazer', 'áo khoác nhẹ', 'aokhoac nhe'],
    thu: ['cardigan', 'blazer', 'áo dài tay', 'ao dai tay', 'hoodie mỏng']
  };

  const out = new Set();
  (seasonTerms || []).forEach((season) => {
    const arr = map[season];
    if (Array.isArray(arr)) arr.forEach((k) => out.add(k));
  });
  return Array.from(out);
}

function extractOrderCodes(question) {
  const text = String(question || '').toUpperCase();
  if (!text) return [];
  const regex = /\bDH\d{8,}\b/g;
  const found = text.match(regex) || [];
  return Array.from(new Set(found)).slice(0, 5);
}

function buildSystemPrompt() {
  return [
 'Bạn là trợ lý AI của website bán thời trang.',
'Vai trò của bạn là hỗ trợ khách hàng như một nhân viên tư vấn bán hàng chuyên nghiệp.',
'Luôn trả lời bằng tiếng Việt có dấu, câu ngắn gọn, rõ ràng, tự nhiên như nhân viên tư vấn trong cửa hàng.',
'Giữ giọng điệu thân thiện, lịch sự, dễ hiểu.',

'Chỉ được trả lời dựa trên dữ liệu được cung cấp.',
'TUYỆT ĐỐI không được tự tạo thông tin nếu dữ liệu không có.',
'Không suy đoán, không bịa thêm chi tiết.',

'Nếu không đủ dữ liệu để trả lời, hãy nói rõ là hiện chưa có thông tin.',
'Sau đó hướng dẫn người dùng xem các trang phù hợp trên website như: sản phẩm, voucher, bảng size, giỏ hàng hoặc đơn hàng.',

'Khi người dùng hỏi về đơn hàng của họ, chỉ được sử dụng dữ liệu đơn hàng cá nhân của họ.',
'Không suy đoán hoặc tạo thêm đơn hàng không tồn tại.',
'Nếu không tìm thấy đơn hàng, hãy hướng dẫn người dùng kiểm tra trang đơn hàng.',

'Khi người dùng hỏi về voucher của họ, chỉ được sử dụng dữ liệu voucher cá nhân của họ.',
'Không được tự tạo voucher hoặc thông tin giảm giá.',

'Khi tư vấn size sản phẩm, ưu tiên dựa vào bảng size và size còn sẵn của sản phẩm.',
'Nếu chưa đủ thông tin để tư vấn size chính xác, hãy hỏi thêm chiều cao hoặc cân nặng của khách.',

'Khi người dùng hỏi về đánh giá sản phẩm, ưu tiên dựa vào các đánh giá và sản phẩm được đánh giá cao.',
'Không tự tạo đánh giá nếu dữ liệu không có.',

'Khi người dùng hỏi về sản phẩm bán chạy, xu hướng hoặc thống kê, ưu tiên sử dụng dữ liệu thống kê và sản phẩm bán chạy.',

'Khi sản phẩm có giảm giá, luôn ưu tiên dùng giá đã giảm làm giá chính để tư vấn.',
'Chỉ nêu thêm giá gốc khi cần so sánh, không được báo giá gốc thành giá hiện tại.',

'Khi người dùng hỏi tư vấn mua hàng theo mùa hoặc dịp (ví dụ: mùa hè, mùa đông, đi biển, đi tiệc...).',
'Chỉ được gợi ý các sản phẩm thực sự phù hợp với mùa hoặc dịp đó.',

'Nếu không có sản phẩm phù hợp với mùa hoặc dịp được hỏi, phải nói rõ là hiện chưa có.',
'Không được gợi ý sản phẩm không liên quan. và gửi các đường link không liên quan',

'Mỗi lần chỉ gợi ý tối đa 4 sản phẩm tiêu biểu.',
'Nếu có nhiều sản phẩm phù hợp, hãy chọn những sản phẩm nổi bật nhất.',

'TUYỆT ĐỐI không nhắc tới tên biến, cấu trúc dữ liệu hoặc thuật ngữ kỹ thuật.',
'Không được nhắc đến các từ như JSON, context, products, vouchers, sizeGuides, database hoặc API.',

'Không giải thích cách hệ thống hoạt động.',
'Chỉ trả lời kết quả cuối cùng cho người dùng như một nhân viên tư vấn thực sự.'
  ].join(' ');
}

async function getStoreStats() {
  const [productCount, categoryCount, brandCount, flashSaleCount] = await Promise.all([
    Sanpham.countDocuments({ daxoa: { $ne: true }, trangthai: { $in: ['active', 'dangban'] } }),
    Danhmuc.countDocuments({ daxoa: { $ne: true }, isActive: true }),
    Brand.countDocuments({ daXoa: { $ne: true }, isActive: true }),
    FlashSale.countDocuments({
      hienthi: true,
      batdau: { $lte: new Date() },
      ketthuc: { $gte: new Date() }
    })
  ]);

  return { productCount, categoryCount, brandCount, flashSaleCount };
}

async function getOpsStats() {
  const [
    users,
    orders,
    orderItems,
    reviews,
    favorites,
    pays,
    inventoryLots,
    importReceipts,
    exportReceipts,
    lookbooks,
    homeSections,
    loginLogs
  ] = await Promise.all([
    Nguoidung.countDocuments({ daxoa: { $ne: true } }),
    Donhang.countDocuments({ daxoa: { $ne: true } }),
    Chitietdonhang.countDocuments({}),
    Danhgia.countDocuments({}),
    Yeuthich.countDocuments({}),
    Thanhtoan.countDocuments({}),
    TonKhoLo.countDocuments({}),
    ImportReceipt.countDocuments({}),
    PhieuXuatKho.countDocuments({}),
    Lookbook.countDocuments({}),
    HomeSection.countDocuments({}),
    LoginLog.countDocuments({})
  ]);

  let sessions = 0;
  try {
    const db = mongoose.connection && mongoose.connection.db;
    if (db) {
      sessions = await db.collection('sessions').countDocuments({});
    }
  } catch {
    sessions = 0;
  }

  return {
    users,
    orders,
    orderItems,
    reviews,
    favorites,
    pays,
    inventoryLots,
    importReceipts,
    exportReceipts,
    lookbooks,
    homeSections,
    sessions,
    loginLogs
  };
}

async function getTopSellingProducts() {
  const top = await Chitietdonhang.aggregate([
    {
      $group: {
        _id: '$sanpham_id',
        totalSold: { $sum: { $ifNull: ['$soluong', 0] } }
      }
    },
    { $sort: { totalSold: -1 } },
    { $limit: 8 },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        sanpham_id: '$_id',
        tensanpham: '$product.tensanpham',
        hinhanh: '$product.hinhanh',
        totalSold: 1,
        gia: '$product.gia',
        phantramgiamgia: '$product.phantramgiamgia',
        giaSauGiam: {
          $cond: [
            { $gt: [{ $ifNull: ['$product.phantramgiamgia', 0] }, 0] },
            {
              $round: [
                {
                  $multiply: [
                    { $ifNull: ['$product.gia', 0] },
                    {
                      $subtract: [
                        1,
                        { $divide: [{ $ifNull: ['$product.phantramgiamgia', 0] }, 100] }
                      ]
                    }
                  ]
                },
                0
              ]
            },
            { $ifNull: ['$product.gia', 0] }
          ]
        }
      }
    }
  ]);

  const flashMap = await getActiveFlashSalePriceMap((top || []).map((item) => item.sanpham_id));

  return (top || []).map((item) => {
    const gia = Number(item.gia || 0);
    const percent = Number(item.phantramgiamgia || 0);
    const baseCurrent = getCurrentPriceFromRecord(item);
    const giaSauGiam = applyFlashSaleToCurrentPrice({
      record: item,
      currentPrice: baseCurrent,
      flashEntry: flashMap.get(String(item.sanpham_id || ''))
    });

    return {
      id: item.sanpham_id ? String(item.sanpham_id) : '',
      tensanpham: item.tensanpham || 'Sản phẩm',
      imageUrl: normalizeImageUrl(item.hinhanh),
      url: item.sanpham_id ? `/products/${item.sanpham_id}` : '',
      totalSold: Number(item.totalSold || 0),
      gia,
      giaSauGiam,
      phantramgiamgia: percent
    };
  });
}

async function getRatingSummary() {
  const rows = await Danhgia.aggregate([
    {
      $match: {
        daxoa: { $ne: true },
        hienthi: true,
        trangthai: { $in: ['approved', 'pending'] }
      }
    },
    {
      $group: {
        _id: '$sanpham_id',
        avgRating: { $avg: { $ifNull: ['$diem', 0] } },
        count: { $sum: 1 }
      }
    },
    { $sort: { avgRating: -1, count: -1 } },
    { $limit: 6 },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        tensanpham: '$product.tensanpham',
        avgRating: 1,
        count: 1
      }
    }
  ]);

  return (rows || []).map((item) => ({
    tensanpham: item.tensanpham || 'Sản phẩm',
    avgRating: Number(item.avgRating || 0).toFixed(1),
    count: Number(item.count || 0)
  }));
}

async function getReviewContext(question, userId) {
  const terms = buildSearchTerms(question);
  const productFilter = {};
  if (terms.length > 0) {
    productFilter.$or = terms.map((term) => ({ tensanpham: toSafeRegex(term) }));
  }

  const productIds = await Sanpham.find(productFilter).select('_id').limit(20).lean();
  const idList = (productIds || []).map((p) => p._id).filter(Boolean);

  const reviewFilter = {
    daxoa: { $ne: true },
    hienthi: true,
    trangthai: { $in: ['approved', 'pending'] }
  };

  if (idList.length > 0) {
    reviewFilter.sanpham_id = { $in: idList };
  }

  const [recentReviews, myReviews] = await Promise.all([
    Danhgia.find(reviewFilter)
      .select('sanpham_id diem tieude noidung mausac kichco tags ngaytao')
      .populate({ path: 'sanpham_id', select: 'tensanpham' })
      .sort({ ngaytao: -1 })
      .limit(12)
      .lean(),
    userId
      ? Danhgia.find({ nguoidung_id: userId, daxoa: { $ne: true } })
        .select('sanpham_id diem tieude noidung trangthai ngaytao')
        .populate({ path: 'sanpham_id', select: 'tensanpham' })
        .sort({ ngaytao: -1 })
        .limit(8)
        .lean()
      : Promise.resolve([])
  ]);

  return {
    recent: (recentReviews || []).map((item) => ({
      tensanpham: item && item.sanpham_id ? item.sanpham_id.tensanpham : '',
      diem: Number(item.diem || 0),
      tieude: item.tieude || '',
      noidung: item.noidung || '',
      mausac: item.mausac || '',
      kichco: item.kichco || '',
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 5) : [],
      ngaytao: item.ngaytao
    })),
    mine: (myReviews || []).map((item) => ({
      tensanpham: item && item.sanpham_id ? item.sanpham_id.tensanpham : '',
      diem: Number(item.diem || 0),
      tieude: item.tieude || '',
      noidung: item.noidung || '',
      trangthai: item.trangthai || '',
      ngaytao: item.ngaytao
    }))
  };
}

async function getSettingsSnapshot() {
  const settings = await Setting.find({})
    .select('key value ten mota')
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .limit(20)
    .lean();

  return (settings || []).map((item) => ({
    key: item.key || item.ten || '',
    value: item.value,
    mota: item.mota || ''
  }));
}

async function getProductContext(question) {
  const terms = buildSearchTerms(question);
  const intent = extractProductIntent(question);
  const priceConstraint = extractPriceConstraint(question);
  const query = { daxoa: { $ne: true }, trangthai: { $in: ['active', 'dangban'] } };
  const andConditions = [];
  const normalizedQuestion = normalizeText(question).toLowerCase();
  const asciiQuestion = normalizedQuestion
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const orConditions = [];

  if (terms.length > 0) {
    terms.forEach((term) => {
      orConditions.push({ tensanpham: toSafeRegex(term) });
      orConditions.push({ mota: toSafeRegex(term) });
      orConditions.push({ loaisanpham: toSafeRegex(term) });
    });
  }

  if (intent.seasonTerms.length > 0) {
    intent.seasonTerms.forEach((term) => {
      orConditions.push({ tensanpham: toSafeRegex(term) });
      orConditions.push({ mota: toSafeRegex(term) });
      orConditions.push({ loaisanpham: toSafeRegex(term) });
    });

    const related = relatedKeywordsBySeason(intent.seasonTerms);
    related.forEach((term) => {
      orConditions.push({ tensanpham: toSafeRegex(term) });
      orConditions.push({ mota: toSafeRegex(term) });
      orConditions.push({ loaisanpham: toSafeRegex(term) });
    });
  }

  if (intent.occasionTerms.length > 0) {
    const normalizeLoose = (value) => String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const occasionRows = await Danhmuc.find({
      daxoa: { $ne: true },
      type: 'occasion'
    }).select('_id name tendanhmuc slug').lean();

    const normalizedTerms = intent.occasionTerms
      .map((term) => normalizeLoose(term))
      .filter(Boolean);

    const ids = (occasionRows || [])
      .filter((item) => {
        const fields = [item && item.name, item && item.tendanhmuc, item && item.slug]
          .map((v) => normalizeLoose(v))
          .filter(Boolean);
        if (!fields.length) return false;
        return normalizedTerms.some((term) => fields.some((field) => field.includes(term)));
      })
      .map((item) => item && item._id)
      .filter(Boolean);

    if (ids.length > 0) {
      andConditions.push({
        $or: [
          { occasion: { $in: ids } },
          { dip_sudung_id: { $in: ids } },
          { occasions: { $in: ids } }
        ]
      });
    }

    intent.occasionTerms.forEach((term) => {
      orConditions.push({ tensanpham: toSafeRegex(term) });
      orConditions.push({ mota: toSafeRegex(term) });
    });
  }

  const ageCategories = await Danhmuc.find({
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
    if (Number.isFinite(value) && value > 0 && value <= 120) {
      minRequestedAge = value;
    }
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
    for (const m of matches) {
      const ageValue = Number(m[1] || m[2] || 0);
      if (Number.isFinite(ageValue) && ageValue > 0 && ageValue <= 120) {
        requestedAges.push(ageValue);
      }
    }
  };

  collectAgeMatches(normalizedQuestion);
  collectAgeMatches(asciiQuestion);

  const matchedAgeIds = [];
  (ageCategories || []).forEach((item) => {
    const label = String(item && (item.name || item.tendanhmuc || item.slug) || '').toLowerCase();
    if (!label) return;

    const normalizedLabel = normalizeText(label).toLowerCase();
    const asciiLabel = normalizedLabel
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      normalizedQuestion.includes(normalizedLabel)
      || normalizedQuestion.includes(asciiLabel)
    ) {
      matchedAgeIds.push(item._id);
      return;
    }

    const rangeMatch = asciiLabel.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
    if (!rangeMatch) return;
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;

    if (Number.isFinite(minRequestedAge) && !Number.isFinite(maxRequestedAge)) {
      if (max >= minRequestedAge) {
        matchedAgeIds.push(item._id);
      }
      return;
    }

    if (Number.isFinite(minRequestedAge) && Number.isFinite(maxRequestedAge)) {
      const overlaps = Math.max(min, minRequestedAge) <= Math.min(max, maxRequestedAge);
      if (overlaps) {
        matchedAgeIds.push(item._id);
      }
      return;
    }

    if (requestedAges.some((age) => age >= min && age <= max)) {
      matchedAgeIds.push(item._id);
    }
  });

  if (matchedAgeIds.length > 0) {
    andConditions.push({
      $or: [
        { ageGroup: { $in: matchedAgeIds } },
        { nhomtuoi_id: { $in: matchedAgeIds } }
      ]
    });
  }

  const brands = await Brand.find({
    daXoa: { $ne: true },
    $or: [{ isActive: true }, { hienthi: true }]
  }).select('_id ten slug').lean();

  const matchedBrandIds = (brands || [])
    .filter((item) => {
      const name = String(item && (item.ten || item.slug) || '').trim();
      if (!name) return false;
      const normalizedName = normalizeText(name).toLowerCase();
      const asciiName = normalizedName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return (
        normalizedQuestion.includes(normalizedName)
        || normalizedQuestion.includes(asciiName)
      );
    })
    .map((item) => item._id)
    .filter(Boolean);

  if (matchedBrandIds.length > 0) {
    andConditions.push({
      $or: [
        { brand: { $in: matchedBrandIds } },
        { thuonghieu_id: { $in: matchedBrandIds } }
      ]
    });
  }

  if (orConditions.length > 0) {
    query.$or = orConditions;
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  const findProducts = async (filter) => Sanpham.find(filter)
    .select('_id tensanpham hinhanh mota gia phantramgiamgia soluongton gioitinh loaisanpham mausac_chinh sizes bienthe')
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .limit(priceConstraint ? 48 : 6)
    .lean({ virtuals: true });

  let products = await findProducts(query);

  // If keyword OR is too strict while structured filters already matched (age/brand/occasion),
  // retry without OR to avoid false negatives like "chưa có" despite existing products.
  if ((!products || products.length === 0) && andConditions.length > 0 && query.$or) {
    const queryWithoutOr = { ...query };
    delete queryWithoutOr.$or;
    products = await findProducts(queryWithoutOr);
  }

  const flashMap = await getActiveFlashSalePriceMap((products || []).map((item) => item && item._id));

  const mapped = products.map((item) => {
    const basePrice = Number(item.gia || 0);
    const percent = Number(item.phantramgiamgia || 0);
    const baseCurrent = getCurrentPriceFromRecord(item);
    const finalPrice = applyFlashSaleToCurrentPrice({
      record: item,
      currentPrice: baseCurrent,
      flashEntry: flashMap.get(String(item && item._id || ''))
    });

    const sizeSet = new Set();
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

    if (Array.isArray(item.sizes)) {
      item.sizes.forEach((s) => {
        if (s && s.size && Number(s.soluong || 0) > 0) sizeSet.add(String(s.size));
      });
    }
    if (Array.isArray(item.bienthe)) {
      item.bienthe.forEach((variant) => {
        const variantColor = variant && variant.mausac ? String(variant.mausac).trim() : '';
        const variantHasStock = Boolean(
          variant
          && Array.isArray(variant.sizes)
          && variant.sizes.some((s) => s && Number(s.soluong || 0) > 0)
        );
        if (variantColor) upsertColorStatus(variantColor, variantHasStock);

        if (!variant || !Array.isArray(variant.sizes)) return;
        variant.sizes.forEach((s) => {
          if (s && s.size && Number(s.soluong || 0) > 0) sizeSet.add(String(s.size));
        });
      });
    }

    return {
      id: String(item._id || ''),
      tensanpham: item.tensanpham || 'San pham',
      imageUrl: normalizeImageUrl(item.hinhanh),
      url: item._id ? `/products/${item._id}` : '',
      gia: basePrice,
      phantramgiamgia: percent,
      giaSauGiam: finalPrice,
      soluongton: Number(item.soluongton || 0),
      gioitinh: item.gioitinh || '',
      loaisanpham: item.loaisanpham || '',
      sizeCoSan: Array.from(sizeSet).slice(0, 12),
      mauSacCoSan: Array.from(colorSet).slice(0, 12),
      mauSacChiTiet: Array.from(colorDetailMap.values()).slice(0, 12)
    };
  });

  if (!priceConstraint) return mapped;

  return mapped
    .filter((item) => matchPriceConstraint(item.giaSauGiam || item.gia, priceConstraint))
    .slice(0, 6);
}

function buildOpenClipReply(question, products, openClipMeta) {
  const q = normalizeText(question);
  const list = Array.isArray(products) ? products.slice(0, 4) : [];
  if (list.length === 0) {
    return {
      content: 'Mình chưa tìm thấy sản phẩm phù hợp theo mô tả này. Bạn thử mô tả rõ hơn về kiểu dáng, màu sắc hoặc chất liệu nhé.',
      model: (openClipMeta && openClipMeta.model) || 'ViT-B-32',
      provider: 'openclip'
    };
  }

  const lines = [
    q ? `Mình đã tìm bằng OpenCLIP theo mô tả: "${q}".` : 'Mình đã tìm bằng OpenCLIP theo mô tả của bạn.',
    'Gợi ý phù hợp nhất:'
  ];

  list.forEach((item, index) => {
    const finalPrice = Number(item.giaSauGiam || item.gia || 0);
    const priceText = finalPrice > 0 ? `${finalPrice.toLocaleString('vi-VN')}đ` : 'Liên hệ';
    lines.push(`${index + 1}. ${item.tensanpham || 'Sản phẩm'} - ${priceText}`);
  });

  lines.push('Bạn muốn mình lọc thêm theo tầm giá, giới tính hoặc loại sản phẩm không?');

  return {
    content: lines.join('\n'),
    model: (openClipMeta && openClipMeta.model) || 'ViT-B-32',
    provider: 'openclip'
  };
}

function formatVoucherValue(voucher) {
  if (!voucher) return '';
  const type = String(voucher.loai || '');
  const value = Number(voucher.giatri || 0);
  if (type === 'phantram') return `${value}%`;
  return `${value.toLocaleString('vi-VN')}đ`;
}

async function getVoucherContext() {
  const now = new Date();
  const vouchers = await Coupon.find({
    daxoa: { $ne: true },
    trangthai: 'active',
    ngay_batdau: { $lte: now },
    ngay_ketthuc: { $gte: now },
    $expr: { $lt: ['$soluong_dasudung', '$soluong_toida'] }
  })
    .select('code ten mota loai giatri don_toithieu giam_toida ngay_ketthuc soluong_toida soluong_dasudung')
    .sort({ ngay_ketthuc: 1, giatri: -1 })
    .limit(8)
    .lean();

  return vouchers.map((voucher) => ({
    code: voucher.code,
    ten: voucher.ten || '',
    mota: voucher.mota || '',
    loai: voucher.loai,
    giaTriHienThi: formatVoucherValue(voucher),
    donToiThieu: Number(voucher.don_toithieu || 0),
    giamToiDa: Number(voucher.giam_toida || 0),
    conLai: Math.max(0, Number(voucher.soluong_toida || 0) - Number(voucher.soluong_dasudung || 0)),
    ngayKetThuc: voucher.ngay_ketthuc
  }));
}

async function getMyVoucherSummary(userId) {
  if (!userId) return null;

  const now = new Date();
  const rows = await UserVoucher.find({ nguoidung_id: userId, isUsed: false })
    .select('voucher_id savedAt')
    .populate({
      path: 'voucher_id',
      select: 'code ten loai giatri trangthai daxoa ngay_batdau ngay_ketthuc soluong_toida soluong_dasudung'
    })
    .sort({ savedAt: -1 })
    .limit(12)
    .lean();

  const active = rows
    .map((r) => r.voucher_id)
    .filter((v) => v && v.trangthai === 'active' && !v.daxoa && new Date(v.ngay_batdau) <= now && new Date(v.ngay_ketthuc) >= now)
    .map((v) => ({
      code: v.code,
      ten: v.ten || '',
      giaTriHienThi: formatVoucherValue(v),
      ngayKetThuc: v.ngay_ketthuc
    }));

  return {
    totalSaved: rows.length,
    active
  };
}

async function getSizeGuideContext(question) {
  const terms = buildSearchTerms(question);
  const query = { daxoa: { $ne: true } };

  if (terms.length > 0) {
    query.$or = [
      ...terms.map((t) => ({ tenbang: toSafeRegex(t) })),
      ...terms.map((t) => ({ loaisanpham: toSafeRegex(t) }))
    ];
  }

  const guides = await SizeGuide.find(query)
    .select('tenbang loaisanpham cot dong goiy')
    .sort({ ngaycapnhat: -1 })
    .limit(5)
    .lean();

  return guides.map((guide) => ({
    tenbang: guide.tenbang,
    loaisanpham: guide.loaisanpham,
    cot: Array.isArray(guide.cot) ? guide.cot.slice(0, 8) : [],
    sizes: Array.isArray(guide.dong)
      ? guide.dong.slice(0, 10).map((row) => ({ size: row.size, giatri: Array.isArray(row.giatri) ? row.giatri.slice(0, 8) : [] }))
      : [],
    goiy: guide.goiy || ''
  }));
}

async function getActiveFlashSaleContext() {
  const active = await FlashSale.findOne({
    hienthi: true,
    batdau: { $lte: new Date() },
    ketthuc: { $gte: new Date() }
  })
    .select('ten batdau ketthuc phantramgiamgia sanpham')
    .sort({ batdau: -1 })
    .lean();

  if (!active) return null;
  return {
    ten: active.ten,
    batdau: active.batdau,
    ketthuc: active.ketthuc,
    phantramgiamgia: active.phantramgiamgia,
    soLuongSanPham: Array.isArray(active.sanpham) ? active.sanpham.length : 0
  };
}

async function getMyOrderSummary(userId, question) {
  if (!userId) return null;

  const orderCodes = extractOrderCodes(question);
  const codeFilter = orderCodes.length > 0
    ? { madonhang: { $in: orderCodes } }
    : null;

  const [totalOrders, latestOrders, matchedOrders] = await Promise.all([
    Donhang.countDocuments({ nguoidung_id: userId, daxoa: { $ne: true } }),
    Donhang.find({ nguoidung_id: userId, daxoa: { $ne: true } })
      .select('madonhang trangthai tongtien ngaytao lydohuy phuongthucthanhtoan')
      .sort({ ngaytao: -1 })
      .limit(5)
      .lean(),
    codeFilter
      ? Donhang.find({ nguoidung_id: userId, daxoa: { $ne: true }, ...codeFilter })
        .select('madonhang trangthai tongtien ngaytao lydohuy phuongthucthanhtoan')
        .sort({ ngaytao: -1 })
        .limit(5)
        .lean()
      : Promise.resolve([])
  ]);

  return {
    totalOrders,
    requestedOrderCodes: orderCodes,
    latestOrders: (latestOrders || []).map((order) => ({
      madonhang: order.madonhang,
      trangthai: order.trangthai,
      tongtien: Number(order.tongtien || 0),
      ngaytao: order.ngaytao,
      lydohuy: order.lydohuy || '',
      phuongthucthanhtoan: order.phuongthucthanhtoan || ''
    })),
    matchedOrders: (matchedOrders || []).map((order) => ({
      madonhang: order.madonhang,
      trangthai: order.trangthai,
      tongtien: Number(order.tongtien || 0),
      ngaytao: order.ngaytao,
      lydohuy: order.lydohuy || '',
      phuongthucthanhtoan: order.phuongthucthanhtoan || ''
    }))
  };
}

async function buildDataContext({ question, userId, useOpenClip = false }) {
  const [
    stats,
    opsStats,
    products,
    flashSale,
    myOrders,
    vouchers,
    myVouchers,
    sizeGuides,
    topSelling,
    topRated,
    settings,
    reviews
  ] = await Promise.all([
    getStoreStats(),
    getOpsStats(),
    getProductContext(question),
    getActiveFlashSaleContext(),
    getMyOrderSummary(userId, question),
    getVoucherContext(),
    getMyVoucherSummary(userId),
    getSizeGuideContext(question),
    getTopSellingProducts(),
    getRatingSummary(),
    getSettingsSnapshot(),
    getReviewContext(question, userId)
  ]);

  const context = {
    generatedAt: new Date().toISOString(),
    stats,
    opsStats,
    flashSale,
    products,
    vouchers,
    sizeGuides,
    myOrders,
    myVouchers,
    topSelling,
    topRated,
    settings,
    reviews
  };

  if (useOpenClip) {
    try {
      const baseCandidates = await Sanpham.find({
        daxoa: { $ne: true },
        trangthai: { $in: ['active', 'dangban'] }
      })
        .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham sizes bienthe ngaycapnhat ngaytao')
        .sort({ ngaycapnhat: -1, ngaytao: -1 })
        .limit(48)
        .lean({ virtuals: true });

      const flashMap = await getActiveFlashSalePriceMap((baseCandidates || []).map((item) => item && item._id));

      const mappedCandidates = (baseCandidates || []).map((item) => {
        const basePrice = Number(item.gia || 0);
        const percent = Number(item.phantramgiamgia || 0);
        const baseCurrent = getCurrentPriceFromRecord(item);
        const finalPrice = applyFlashSaleToCurrentPrice({
          record: item,
          currentPrice: baseCurrent,
          flashEntry: flashMap.get(String(item && item._id || ''))
        });

        const sizeSet = new Set();
        if (Array.isArray(item.sizes)) {
          item.sizes.forEach((s) => {
            if (s && s.size && Number(s.soluong || 0) > 0) sizeSet.add(String(s.size));
          });
        }
        if (Array.isArray(item.bienthe)) {
          item.bienthe.forEach((variant) => {
            if (!variant || !Array.isArray(variant.sizes)) return;
            variant.sizes.forEach((s) => {
              if (s && s.size && Number(s.soluong || 0) > 0) sizeSet.add(String(s.size));
            });
          });
        }

        return {
          id: String(item._id || ''),
          tensanpham: item.tensanpham || 'San pham',
          imageUrl: normalizeImageUrl(item.hinhanh),
          url: item._id ? `/products/${item._id}` : '',
          gia: basePrice,
          phantramgiamgia: percent,
          giaSauGiam: finalPrice,
          soluongton: Number(item.soluongton || 0),
          gioitinh: item.gioitinh || '',
          loaisanpham: item.loaisanpham || '',
          sizeCoSan: Array.from(sizeSet).slice(0, 12)
        };
      });

      const ranked = await rankProductsByQuery({
        query: question,
        products: mappedCandidates,
        topK: 6
      });

      if (ranked && ranked.used && Array.isArray(ranked.matches) && ranked.matches.length > 0) {
        context.products = ranked.matches;
        context.openClip = {
          enabled: true,
          used: true,
          model: ranked.meta && ranked.meta.model ? ranked.meta.model : '',
          pretrained: ranked.meta && ranked.meta.pretrained ? ranked.meta.pretrained : '',
          device: ranked.meta && ranked.meta.device ? ranked.meta.device : '',
          candidates: Number(ranked.meta && ranked.meta.candidates ? ranked.meta.candidates : 0)
        };
      } else {
        context.openClip = {
          enabled: true,
          used: false,
          reason: ranked && ranked.reason ? ranked.reason : 'NO_MATCH'
        };
      }
    } catch (error) {
      context.openClip = {
        enabled: true,
        used: false,
        reason: 'ERROR',
        error: String(error && error.message ? error.message : 'OPENCLIP_FAILED')
      };
    }
  }

  return context;
}

async function askOllama({ question, history, context, systemPrompt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const finalSystemPrompt = resolveSystemPrompt(systemPrompt);

  const messages = [
    { role: 'system', content: finalSystemPrompt },
    {
      role: 'system',
      content: `Context JSON: ${JSON.stringify(buildModelContext(context))}`
    },
    ...takeRecentMessages(history, 8),
    { role: 'user', content: compactWhitespace(question) }
  ];

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        keep_alive: OLLAMA_KEEP_ALIVE,
        stream: false,
        messages,
        options: {
          temperature: 0.2,
          num_predict: OLLAMA_NUM_PREDICT
        }
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error((data && data.error) || `Ollama HTTP ${response.status}`);
    }

    const content = humanizeReply(compactWhitespace(data && data.message && data.message.content));
    if (!content) throw new Error('Ollama trả về rỗng');

    return {
      content,
      model: OLLAMA_MODEL,
      provider: 'ollama'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function askGemini({ question, history, context, model, systemPrompt }) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const contextForModel = buildModelContext(context);

  const finalSystemPrompt = resolveSystemPrompt(systemPrompt);
  const callGeminiByModel = async (modelName, maxAttempts = 2) => {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const isGemmaModel = String(modelName || '').toLowerCase().startsWith('gemma-');
    const contents = [
      {
        role: 'user',
        parts: [{ text: `Context JSON: ${JSON.stringify(contextForModel)}` }]
      },
      ...takeRecentMessages(history, 8).map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }]
      })),
      {
        role: 'user',
        parts: [{ text: compactWhitespace(question) }]
      }
    ];

    const payload = {
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS
      }
    };

    if (isGemmaModel) {
      const firstText = contents[0] && contents[0].parts && contents[0].parts[0] && contents[0].parts[0].text
        ? String(contents[0].parts[0].text)
        : '';
      contents[0].parts[0].text = `${finalSystemPrompt}\n\n${firstText}`;
    } else {
      payload.systemInstruction = {
        parts: [{ text: finalSystemPrompt }]
      };
    }

      try {
        const url = `${GEMINI_API_URL}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data && data.error && data.error.message ? data.error.message : `Gemini HTTP ${response.status}`;
          throw new Error(message);
        }

        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
        const text = Array.isArray(parts)
          ? parts.map((p) => (p && p.text ? String(p.text) : '')).join('\n')
          : '';

        const content = humanizeReply(compactWhitespace(text));
        if (!content) throw new Error('Gemini trả về rỗng');

        return content;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !isGeminiTransientError(error && error.message)) {
          throw error;
        }
        await sleep(1200 * attempt);
      }
    }

    throw lastError || new Error('Gemini request failed');
  };

  const requestedModel = (() => {
    const selectedRaw = String(model || '').trim();
    const selected = selectedRaw === 'gemma-3-4b'
      ? 'gemma-3-4b-it'
      : selectedRaw === 'gemma-3-12b'
        ? 'gemma-3-12b-it'
        : selectedRaw === 'gemma-3-27b'
          ? 'gemma-3-27b-it'
          : selectedRaw;
    if (selected && GEMINI_ALLOWED_MODELS.includes(selected)) return selected;
    if (GEMINI_ALLOWED_MODELS.includes(GEMINI_MODEL)) return GEMINI_MODEL;
    return 'gemma-3-12b-it';
  })();

  try {
    try {
      const content = await callGeminiByModel(requestedModel);
      return {
        content,
        model: requestedModel,
        provider: 'gemini'
      };
    } catch (error) {
      const message = String(error && error.message ? error.message : '').toLowerCase();
      const shouldFallback = requestedModel !== GEMINI_FALLBACK_MODEL
        && (
          message.includes('not enabled')
          || message.includes('not found')
          || message.includes('developer instruction')
          || message.includes('unsupported')
          || isGeminiTransientError(message)
        );

      if (!shouldFallback) throw error;

      const content = await callGeminiByModel(GEMINI_FALLBACK_MODEL);
      return {
        content,
        model: GEMINI_FALLBACK_MODEL,
        provider: 'gemini'
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function askOpenRouter({ question, history, context, systemPrompt }) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY_MISSING');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  const contextForModel = buildModelContext(context);

  const finalSystemPrompt = resolveSystemPrompt(systemPrompt);
  const messages = [
    { role: 'system', content: finalSystemPrompt },
    {
      role: 'system',
      content: `Context JSON: ${JSON.stringify(contextForModel)}`
    },
    ...takeRecentMessages(history, 8),
    { role: 'user', content: compactWhitespace(question) }
  ];

  const callOpenRouterByModel = async (modelName) => {
    const baseUrl = getOpenRouterBaseUrl();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'X-API-Key': OPENROUTER_API_KEY,
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': OPENROUTER_APP_NAME
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: 0.2,
        max_tokens: OPENROUTER_MAX_TOKENS
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : `OpenRouter HTTP ${response.status}`;
      throw new Error(message);
    }

    const contentRaw = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    const content = humanizeReply(compactWhitespace(contentRaw));
    if (!content) throw new Error('OpenRouter trả về rỗng');

    return {
      content,
      model: modelName,
      provider: 'openrouter'
    };
  };

  try {
    try {
      return await callOpenRouterByModel(OPENROUTER_MODEL);
    } catch (error) {
      const message = String(error && error.message ? error.message : '').toLowerCase();
      const shouldFallback = OPENROUTER_MODEL !== OPENROUTER_FALLBACK_MODEL
        && (
          message.includes('invalid model params')
          || message.includes('provider and/or model not supported')
          || message.includes('invalid model, expected: "provider/model"')
        );

      if (!shouldFallback) throw error;
      return await callOpenRouterByModel(OPENROUTER_FALLBACK_MODEL);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function askAI({ question, history, context, provider, model, systemPrompt }) {
  const selected = String(provider || '').toLowerCase().trim();
  if (selected === 'openclip') {
    return buildOpenClipReply(question, context && context.products, context && context.openClip);
  }
  if (selected === 'gemini') {
    return askGemini({ question, history, context, model, systemPrompt });
  }
  if (selected === 'openrouter') {
    return askOpenRouter({ question, history, context, systemPrompt });
  }

  try {
    return await askOllama({ question, history, context, systemPrompt });
  } catch (error) {
    if (!isOllamaInsufficientMemoryError(error && error.message)) throw error;

    if (OPENROUTER_API_KEY) {
      try {
        return await askOpenRouter({ question, history, context, systemPrompt });
      } catch {
        // Continue to next fallback.
      }
    }

    if (GEMINI_API_KEY) {
      try {
        return await askGemini({ question, history, context, model: GEMINI_FALLBACK_MODEL, systemPrompt });
      } catch {
        // No more fallback available.
      }
    }

    throw new Error('OLLAMA_MEMORY_INSUFFICIENT');
  }
}

module.exports = {
  buildDataContext,
  askOllama,
  askGemini,
  askOpenRouter,
  askAI
};
