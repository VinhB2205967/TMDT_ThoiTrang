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
} = require('../models');
const ImportReceipt = require('../models/import_receipt_model');

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
  if (!path) return '/products';

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
  return '/products';
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
    .replace(/\bproducts\b/gi, 'sản phẩm')
    .replace(/\bvouchers\b/gi, 'voucher')
    .replace(/https?:\/\/(?:www\.)?(?:website|example\.com|localhost(?::\d+)?)(\/[\w\-À-ỹ\/%]*)?/gi, (_, path) => normalizeInternalPath(path))
    .replace(/\bwebsite\/(orders|products|vouchers|size-guide|cart)\b/gi, (_, segment) => normalizeInternalPath(`/${segment}`));

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
  const normalized = normalizeText(question).toLowerCase();
  if (!normalized) return [];

  const stopWords = new Set([
    'la', 'là', 'co', 'có', 'khong', 'không', 'toi', 'tôi', 'can', 'cần',
    'tim', 'tìm', 'cho', 'xin', 'nhe', 'nhé', 'giup', 'giúp', 've', 'về',
    'san', 'pham', 'sản', 'phẩm', 'bao', 'nhieu', 'nhiêu', 'gia', 'giá',
    'duoc', 'được', 'khuyen', 'nghi', 'gợi', 'ý', 'coi', 'xem'
  ]);

  const terms = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !stopWords.has(item));

  return Array.from(new Set(terms)).slice(0, 6);
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
        phantramgiamgia: '$product.phantramgiamgia'
      }
    }
  ]);

  return (top || []).map((item) => {
    const gia = Number(item.gia || 0);
    const percent = Number(item.phantramgiamgia || 0);
    const giaSauGiam = percent > 0 ? Math.round(gia * (1 - percent / 100)) : gia;

    return {
      id: item.sanpham_id ? String(item.sanpham_id) : '',
      tensanpham: item.tensanpham || 'Sản phẩm',
      imageUrl: normalizeImageUrl(item.hinhanh),
      url: item.sanpham_id ? `/products/${item.sanpham_id}` : '/products',
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
  const query = { daxoa: { $ne: true }, trangthai: { $in: ['active', 'dangban'] } };

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
    const occasionRegex = new RegExp(intent.occasionTerms.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    const matchingOccasions = await Danhmuc.find({
      daxoa: { $ne: true },
      type: 'occasion',
      $or: [{ name: occasionRegex }, { tendanhmuc: occasionRegex }, { slug: occasionRegex }]
    }).select('_id').lean();

    const ids = (matchingOccasions || []).map((item) => item._id).filter(Boolean);
    if (ids.length > 0) {
      query.occasion = { $in: ids };
    }

    intent.occasionTerms.forEach((term) => {
      orConditions.push({ tensanpham: toSafeRegex(term) });
      orConditions.push({ mota: toSafeRegex(term) });
    });
  }

  if (orConditions.length > 0) {
    query.$or = orConditions;
  }

  const products = await Sanpham.find(query)
    .select('_id tensanpham hinhanh mota gia phantramgiamgia soluongton gioitinh loaisanpham sizes bienthe')
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .limit(6)
    .lean();

  return products.map((item) => {
    const basePrice = Number(item.gia || 0);
    const percent = Number(item.phantramgiamgia || 0);
    const finalPrice = percent > 0 ? Math.round(basePrice * (1 - percent / 100)) : basePrice;

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
      url: item._id ? `/products/${item._id}` : '/products',
      gia: basePrice,
      phantramgiamgia: percent,
      giaSauGiam: finalPrice,
      soluongton: Number(item.soluongton || 0),
      gioitinh: item.gioitinh || '',
      loaisanpham: item.loaisanpham || '',
      sizeCoSan: Array.from(sizeSet).slice(0, 12)
    };
  });
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

async function buildDataContext({ question, userId }) {
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

  return {
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
}

async function askOllama({ question, history, context, systemPrompt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const finalSystemPrompt = resolveSystemPrompt(systemPrompt);

  const messages = [
    { role: 'system', content: finalSystemPrompt },
    {
      role: 'system',
      content: `Context JSON: ${JSON.stringify(context)}`
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

  const finalSystemPrompt = resolveSystemPrompt(systemPrompt);
  const callGeminiByModel = async (modelName, maxAttempts = 2) => {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const isGemmaModel = String(modelName || '').toLowerCase().startsWith('gemma-');
    const contents = [
      {
        role: 'user',
        parts: [{ text: `Context JSON: ${JSON.stringify(context)}` }]
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

  const finalSystemPrompt = resolveSystemPrompt(systemPrompt);
  const messages = [
    { role: 'system', content: finalSystemPrompt },
    {
      role: 'system',
      content: `Context JSON: ${JSON.stringify(context)}`
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
  if (selected === 'gemini') {
    return askGemini({ question, history, context, model, systemPrompt });
  }
  if (selected === 'openrouter') {
    return askOpenRouter({ question, history, context, systemPrompt });
  }
  return askOllama({ question, history, context, systemPrompt });
}

module.exports = {
  buildDataContext,
  askOllama,
  askGemini,
  askOpenRouter,
  askAI
};
