const sanpham = require('../../models/product_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const reportsAdminService = require('./admin-reports.service.js');
const {
  Donhang,
  Chitietdonhang,
  Nguoidung,
  Thanhtoan,
  Coupon,
  TonKhoLo
} = require('../../models');
const { askAI } = require('./aiChat.service.js');

const PRODUCT_TYPE_LABELS = {
  ao: 'Ao',
  quan: 'Quan',
  vay: 'Vay',
  phukien: 'Phu kien',
  giay: 'Giay',
  tui: 'Tui',
  aokhoac: 'Ao khoac'
};

const PRODUCT_TYPE_PATTERNS = [
  { key: 'ao', patterns: [/\bao\b/, /\bshirt\b/, /\bt[\s-]?shirt\b/] },
  { key: 'quan', patterns: [/\bquan\b/, /\bpants?\b/, /\btrousers?\b/, /\bjeans?\b/] },
  { key: 'vay', patterns: [/\bvay\b/, /\bdam\b/, /\bdress\b/, /\bskirt\b/] },
  { key: 'phukien', patterns: [/\bphu kien\b/, /\baccessor(?:y|ies)\b/, /\bthat lung\b/, /\bmu\b/, /\bnon\b/] },
  { key: 'giay', patterns: [/\bgiay\b/, /\bshoe?s?\b/, /\bsneaker\b/, /\bsandal\b/] },
  { key: 'tui', patterns: [/\btui\b/, /\bbag\b/, /\bhandbag\b/, /\bpurse\b/] },
  { key: 'aokhoac', patterns: [/\bao khoac\b/, /\bjacket\b/, /\bblazer\b/, /\bouterwear\b/] }
];

const STOCK_QUERY_STOPWORDS = new Set([
  'san', 'pham', 'size', 'sz', 'co', 'con', 'het', 'khong', 'bao', 'nhieu', 'it',
  'so', 'luong', 'ton', 'kho', 'hang', 'mau', 'ma', 'model', 'loai', 'nhom', 'cho',
  'toi', 'minh', 'em', 'anh', 'chi', 'shop', 'cua', 'nay', 'kia', 'voi', 'theo',
  'trong', 'admin', 'xem', 'hoi', 'giup', 'kiem', 'tra'
]);

function getProductStock(product) {
  let total = 0;
  if (Array.isArray(product.sizes)) {
    product.sizes.forEach((s) => {
      total += Number(s && s.soluong ? s.soluong : 0);
    });
  }
  if (Array.isArray(product.bienthe)) {
    product.bienthe.forEach((variant) => {
      if (Array.isArray(variant && variant.sizes)) {
        variant.sizes.forEach((s) => {
          total += Number(s && s.soluong ? s.soluong : 0);
        });
      } else {
        total += Number(variant && variant.soluong ? variant.soluong : 0);
      }
    });
  }
  total += Number(product && product.soluong_chinh ? product.soluong_chinh : 0);
  if (total > 0) return total;
  return Number(product && product.soluongton ? product.soluongton : 0);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-10)
    .map((item) => ({
      role: item && item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item && item.content ? item.content : '').trim()
    }))
    .filter((item) => item.content);
}

function stripVietnamese(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeForLookup(text) {
  return stripVietnamese(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSizeKey(size) {
  return String(size || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^SIZE/, '')
    .trim();
}

function isStockAvailabilityQuestion(question) {
  const q = normalizeForLookup(question);
  if (!q) return false;

  const hasExplicitSize = /\b(?:size|sz|co)\s*[a-z0-9]{1,5}\b/.test(q);
  const hasStockCue = /\b(con|het|co|khong|bao nhieu|nhieu|it|ton kho|so luong)\b/.test(q);
  return hasExplicitSize && hasStockCue;
}

function extractRequestedSizes(question) {
  const q = normalizeForLookup(question);
  if (!q) return [];

  const found = [];
  const seen = new Set();
  const regex = /(?:size|sz|co)\s*([a-z0-9]{1,5})\b/g;
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

function detectRequestedProductType(question) {
  const q = normalizeForLookup(question);
  if (!q) return '';

  for (const type of PRODUCT_TYPE_PATTERNS) {
    if (type.patterns.some((pattern) => pattern.test(q))) {
      return type.key;
    }
  }

  return '';
}

function extractSpecificProductTerms(question) {
  const q = normalizeForLookup(question);
  if (!q) return [];

  const tokens = q
    .replace(/(?:size|sz|co)\s*[a-z0-9]{1,5}\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) => !STOCK_QUERY_STOPWORDS.has(token))
    .filter((token) => !Object.prototype.hasOwnProperty.call(PRODUCT_TYPE_LABELS, token));

  return Array.from(new Set(tokens)).slice(0, 8);
}

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

function rankProductsByTerms(products, question, terms) {
  const questionNorm = normalizeForLookup(question);
  return (Array.isArray(products) ? products : [])
    .map((item, index) => {
      const name = normalizeForLookup(item && item.tensanpham);
      if (!name) return { item, index, score: -1, matchedCount: 0 };

      const matchedCount = terms.filter((term) => name.includes(term)).length;
      let score = matchedCount * 20;

      if (matchedCount && questionNorm.includes(name)) score += 100;
      if (terms.length > 0 && matchedCount === terms.length) score += 60;
      if (name.startsWith(terms[0] || '')) score += 8;

      return { item, index, score, matchedCount };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
      return a.index - b.index;
    });
}

function buildSpecificSizeStockAnswer(product, requestedSizes = []) {
  const row = product && typeof product === 'object' ? product : {};
  const name = String(row.tensanpham || 'San pham').trim();
  const sizeStockMap = buildSizeStockMap(row);
  const uniqueRequestedSizes = Array.from(new Set((Array.isArray(requestedSizes) ? requestedSizes : [])
    .map((size) => normalizeSizeKey(size))
    .filter(Boolean)));

  if (sizeStockMap.size === 0) {
    const totalStock = getProductStock(row);
    return uniqueRequestedSizes.length
      ? `Hien chua co ton kho chi tiet theo size cho ${name}. Ton kho tong hien tai la ${totalStock} san pham.`
      : `Hien tai ${name} con ${totalStock} san pham trong kho.`;
  }

  if (uniqueRequestedSizes.length > 0) {
    const lines = uniqueRequestedSizes.map((size) => {
      const qty = Number(sizeStockMap.get(size) || 0);
      return `- Size ${size}: ${qty} san pham`;
    });
    return [`Ton kho theo size cua ${name}:`, ...lines].join('\n');
  }

  const entries = Array.from(sizeStockMap.entries())
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'vi'))
    .slice(0, 8)
    .map(([size, qty]) => `Size ${size} (${qty})`);
  return `Hien ${name} con hang o cac size: ${entries.join(', ')}.`;
}

function buildAggregateSizeStockAnswer(products, requestedSizes = [], productType = '') {
  const list = Array.isArray(products) ? products : [];
  const uniqueRequestedSizes = Array.from(new Set((Array.isArray(requestedSizes) ? requestedSizes : [])
    .map((size) => normalizeSizeKey(size))
    .filter(Boolean)));

  if (!uniqueRequestedSizes.length) return '';

  const typeLabel = productType && PRODUCT_TYPE_LABELS[productType]
    ? PRODUCT_TYPE_LABELS[productType]
    : 'san pham';

  const summaries = uniqueRequestedSizes.map((size) => {
    let totalQty = 0;
    let matchedProducts = 0;
    const topProducts = [];

    list.forEach((product) => {
      const qty = Number(buildSizeStockMap(product).get(size) || 0);
      if (qty <= 0) return;
      totalQty += qty;
      matchedProducts += 1;
      topProducts.push({
        name: String(product && product.tensanpham ? product.tensanpham : 'San pham'),
        qty
      });
    });

    topProducts.sort((a, b) => b.qty - a.qty);
    return {
      size,
      totalQty,
      matchedProducts,
      topProducts: topProducts.slice(0, 3)
    };
  });

  const nonZeroSummaries = summaries.filter((item) => item.totalQty > 0);
  if (!nonZeroSummaries.length) {
    if (uniqueRequestedSizes.length === 1) {
      return `Hien khong co ${typeLabel} nao con size ${uniqueRequestedSizes[0]} trong kho.`;
    }

    return uniqueRequestedSizes
      .map((size) => `- Size ${size}: 0 san pham`)
      .join('\n');
  }

  if (nonZeroSummaries.length === 1) {
    const item = nonZeroSummaries[0];
    const topLine = item.topProducts.length
      ? ` Mau con nhieu nhat: ${item.topProducts.map((entry) => `${entry.name} (${entry.qty})`).join(', ')}.`
      : '';
    return `Hien ${typeLabel} size ${item.size} con tong ${item.totalQty} san pham tren ${item.matchedProducts} mau.${topLine}`;
  }

  return [
    `Tong ton kho theo size cua nhom ${typeLabel}:`,
    ...summaries.map((item) => `- Size ${item.size}: ${item.totalQty} san pham tren ${item.matchedProducts} mau`)
  ].join('\n');
}

async function buildAdminStockAnswer(question) {
  if (!isStockAvailabilityQuestion(question)) return '';

  const requestedSizes = extractRequestedSizes(question);
  if (!requestedSizes.length) return '';

  const productType = detectRequestedProductType(question);
  const productTerms = extractSpecificProductTerms(question);
  const filter = { daxoa: { $ne: true } };
  if (productType) filter.loaisanpham = productType;

  const products = await sanpham.find(filter)
    .select('_id tensanpham loaisanpham sizes bienthe soluong_chinh soluongton')
    .lean();

  if (!products.length) return '';

  if (productTerms.length > 0) {
    const ranked = rankProductsByTerms(products, question, productTerms);
    const best = ranked[0];
    if (best && best.item && best.matchedCount > 0) {
      return buildSpecificSizeStockAnswer(best.item, requestedSizes);
    }
  }

  return buildAggregateSizeStockAnswer(products, requestedSizes, productType);
}

function detectReportPeriod(question) {
  const raw = String(question || '').trim();
  const normalized = stripVietnamese(raw);
  const now = new Date();

  const yearMatch = normalized.match(/\bnam\s*(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();

  const monthMatch = normalized.match(/\bthang\s*(1[0-2]|0?[1-9])\b/);
  if (monthMatch) {
    const month = Number(monthMatch[1]);
    return {
      type: 'month',
      label: `Tháng ${month}/${year}`,
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 1)
    };
  }

  const start30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start30Days.setDate(start30Days.getDate() - 29);
  return {
    type: 'rolling30d',
    label: '30 ngày gần nhất',
    start: start30Days,
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  };
}

function cleanAdminAnswer(text) {
  let output = String(text || '')
    .replace(/\*\*/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  output = output
    .replace(/\(?\s*productId\s*:\s*[a-f0-9]{24}\s*\)?/gi, '')
    .replace(/\(?\s*productid\s*:\s*\)?\s*[\r\n\s]*[a-f0-9]{24}/gi, '')
    .replace(/\(\s*ID\s*:\s*[a-f0-9]{24}\s*\)/gi, '')
    .replace(/\bID\s*:\s*[a-f0-9]{24}\b/gi, '')
    .replace(/\bproduct\s*id\s*:\s*[a-f0-9]{24}\b/gi, '')
    .replace(/\b[a-f0-9]{24}\b/gi, '')
    .replace(/^\s*[a-f0-9]{24}\s*$/gim, '')
    .replace(/\(\s*\)/g, '')
    .replace(/"\s*\"/g, '"')
    .replace(/\s{2,}/g, ' ');

  output = output
    .replace(/\s*1\.\s*(Tóm tắt[^:]*):?/i, '\n📌 $1:\n')
    .replace(/\s*2\.\s*(Phân tích[^:]*):?/i, '\n📊 $1:\n')
    .replace(/\s*3\.\s*(Vấn đề[^:]*):?/i, '\n⚠️ $1:\n')
    .replace(/\s*4\.\s*(Khuyến nghị[^:]*):?/i, '\n✅ $1:\n')
    .replace(/\s\*\s+/g, '\n- ')
    .replace(/\s-\s+/g, '\n- ')
    .replace(/\s(\d+\.\s)/g, '\n$1')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return output;
}

function normalizeExportStats(raw) {
  const totalRevenue = Number(raw && raw.totalRevenue ? raw.totalRevenue : 0);
  const totalCOGS = Number(raw && raw.totalCOGS ? raw.totalCOGS : 0);
  const totalProfitRaw = Number(raw && raw.totalProfit ? raw.totalProfit : 0);
  const totalSoldItemsRaw = Number(raw && raw.totalSoldItems ? raw.totalSoldItems : 0);
  const totalReturnedItems = Number(raw && raw.totalReturnedItems ? raw.totalReturnedItems : 0);
  const totalExportOrders = Number(raw && raw.totalExportOrders ? raw.totalExportOrders : 0);

  return {
    totalRevenue,
    totalCOGS,
    totalProfit: totalProfitRaw || (totalRevenue - totalCOGS),
    totalSoldItems: Math.max(0, totalSoldItemsRaw - totalReturnedItems),
    totalReturnedItems,
    totalExportOrders
  };
}

function buildAdminSystemPrompt() {
  return [
    'Bạn là AI trợ lý quản trị thông minh cho hệ thống quản lý website bán thời trang.',
    'Mục tiêu của bạn là hỗ trợ admin đưa ra quyết định kinh doanh dựa trên dữ liệu thực tế.',
    'Luôn trả lời bằng tiếng Việt rõ ràng, dễ hiểu, mang tính phân tích và hỗ trợ ra quyết định.',
    'Chỉ sử dụng dữ liệu được cung cấp trong context. Nếu thiếu dữ liệu, hãy nói rõ rằng không đủ thông tin thay vì suy đoán.',
    'Ưu tiên phân tích các yếu tố quan trọng của hệ thống thương mại điện tử:',
    '- Doanh thu theo ngày, tuần, tháng.',
    '- Số lượng đơn hàng.',
    '- Giá trị đơn hàng trung bình.',
    '- Sản phẩm bán chạy.',
    '- Sản phẩm bán chậm.',
    '- Tình trạng tồn kho.',
    '- Khách hàng mua nhiều nhất.',
    '- Hiệu quả các phương thức thanh toán.',
    'Khi phân tích dữ liệu, hãy tìm các xu hướng quan trọng:',
    '- Sản phẩm nào đang bán chạy.',
    '- Sản phẩm nào tồn kho lâu.',
    '- Danh mục nào mang lại nhiều doanh thu.',
    '- Khách hàng nào có giá trị cao.',
    'Luôn trình bày câu trả lời theo cấu trúc rõ ràng để admin dễ đọc:',
    '1. Tóm tắt tình hình chính.',
    '2. Phân tích số liệu quan trọng.',
    '3. Vấn đề cần chú ý.',
    '4. Khuyến nghị hành động.',
    'Khi có số liệu, hãy đưa ra nhận định cụ thể thay vì chỉ liệt kê dữ liệu.',
    'Ví dụ:',
    '- Nếu tồn kho thấp → khuyến nghị nhập thêm hàng.',
    '- Nếu sản phẩm bán chậm → gợi ý giảm giá hoặc chạy khuyến mãi.',
    '- Nếu khách hàng mua nhiều → gợi ý chương trình chăm sóc khách hàng.',
    'Nếu admin hỏi về doanh thu:',
    '- Tính tổng doanh thu.',
    '- So sánh với số đơn.',
    '- Xác định sản phẩm đóng góp nhiều nhất.',
    'Nếu admin hỏi về sản phẩm:',
    '- Phân tích mức bán.',
    '- Xác định sản phẩm hot.',
    '- Xác định sản phẩm tồn kho lâu.',
    'Nếu admin hỏi về đơn hàng:',
    '- Thống kê số đơn.',
    '- Phân loại trạng thái đơn.',
    '- Phát hiện đơn hàng cần xử lý.',
    'Nếu admin hỏi về khách hàng:',
    '- Xác định khách hàng mua nhiều nhất.',
    '- Xác định khách hàng mới.',
    '- Đề xuất chiến lược chăm sóc khách hàng.',
    'Nếu admin hỏi về tồn kho:',
    '- Liệt kê sản phẩm sắp hết hàng.',
    '- Liệt kê sản phẩm tồn kho lâu.',
    '- Đề xuất kế hoạch nhập hàng.',
    'Nếu người dùng nêu thời gian cụ thể như tháng hoặc năm thì bắt buộc phân tích đúng kỳ thời gian đó.',
    'Không dùng markdown trong câu trả lời (không dùng **, #, hoặc ```).',
    'Trả về văn bản thuần, rõ ràng, có đánh số mục.',
    'Luôn trình bày kết quả theo danh sách có icon, đúng định dạng sau:',
    '📌 Tóm tắt tình hình chính',
    '- ...',
    '📊 Phân tích số liệu quan trọng',
    '- ...',
    '⚠️ Vấn đề cần chú ý',
    '- ...',
    '✅ Khuyến nghị hành động',
    '- ...',
    'Luôn giữ câu trả lời ngắn gọn, súc tích nhưng có giá trị phân tích.',
    'Tránh trả lời lan man hoặc mang tính chung chung.',
    'Không nhắc tới chi tiết kỹ thuật như JSON, API, database, schema hoặc cấu trúc dữ liệu.',
    'Luôn tập trung vào góc nhìn quản trị kinh doanh và hỗ trợ admin vận hành cửa hàng hiệu quả hơn.'
  ].join(' ');
}

async function buildAdminDataContext(question) {
  const period = detectReportPeriod(question);
  const periodStart = period.start;
  const periodEnd = period.end;

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start7Days = new Date(startToday);
  start7Days.setDate(start7Days.getDate() - 6);
  const start30Days = new Date(startToday);
  start30Days.setDate(start30Days.getDate() - 29);

  const [
    productCounts,
    userCount,
    orderCount,
    revenueTodayRows,
    revenue7DaysRows,
    orderStatusRows,
    topProductsRows,
    topCustomersRows,
    recentOrders,
    lowStockProducts,
    paymentMethodRows,
    paymentStatusRows,
    exportRows,
    activeVoucherCount,
    inventoryLotRows
  ] = await Promise.all([
    Promise.all([
      sanpham.countDocuments({ daxoa: { $ne: true } }),
      sanpham.countDocuments({ daxoa: { $ne: true }, trangthai: 'dangban' }),
      sanpham.countDocuments({ daxoa: { $ne: true }, trangthai: 'ngungban' })
    ]),
    Nguoidung.countDocuments({ daxoa: { $ne: true } }),
    Donhang.countDocuments({ daxoa: { $ne: true } }),
    Donhang.aggregate([
      {
        $match: {
          daxoa: { $ne: true },
          trangthai: { $ne: 'dahuy' },
          ngaytao: { $gte: startToday }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $ifNull: ['$tongtien', 0] } },
          orders: { $sum: 1 }
        }
      }
    ]),
    Donhang.aggregate([
      {
        $match: {
          daxoa: { $ne: true },
          trangthai: { $ne: 'dahuy' },
          ngaytao: { $gte: start7Days }
        }
      },
      {
        $group: {
          _id: {
            day: {
              $dateToString: { format: '%Y-%m-%d', date: '$ngaytao' }
            }
          },
          revenue: { $sum: { $ifNull: ['$tongtien', 0] } },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1 } }
    ]),
    Donhang.aggregate([
      { $match: { daxoa: { $ne: true } } },
      { $group: { _id: '$trangthai', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Chitietdonhang.aggregate([
      { $match: { ngaytao: { $gte: start30Days } } },
      {
        $group: {
          _id: '$sanpham_id',
          sold: { $sum: { $ifNull: ['$soluong', 0] } },
          revenue: { $sum: { $ifNull: ['$thanhtien', 0] } },
          name: { $first: '$tensanpham' }
        }
      },
      { $sort: { sold: -1, revenue: -1 } },
      { $limit: 10 }
    ]),
    Donhang.aggregate([
      {
        $match: {
          daxoa: { $ne: true },
          trangthai: { $ne: 'dahuy' },
          ngaytao: { $gte: start30Days }
        }
      },
      {
        $group: {
          _id: '$nguoidung_id',
          orders: { $sum: 1 },
          spend: { $sum: { $ifNull: ['$tongtien', 0] } }
        }
      },
      { $sort: { spend: -1, orders: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ['$user.hoten', '$user.tennguoidung'] },
          email: '$user.email',
          orders: 1,
          spend: 1
        }
      }
    ]),
    Donhang.find({ daxoa: { $ne: true } })
      .select('madonhang tennguoinhan nguoidung_hoten trangthai tongtien phuongthucthanhtoan ngaytao')
      .sort({ ngaytao: -1 })
      .limit(10)
      .lean(),
    sanpham.find({ daxoa: { $ne: true }, trangthai: 'dangban' })
      .select('tensanpham sizes bienthe soluong_chinh soluongton')
      .lean(),
    Thanhtoan.aggregate([
      { $match: { ngaytao: { $gte: start30Days } } },
      {
        $group: {
          _id: '$phuongthuc',
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ['$sotien', 0] } }
        }
      },
      { $sort: { total: -1 } }
    ]),
    Thanhtoan.aggregate([
      { $match: { ngaytao: { $gte: start30Days } } },
      {
        $group: {
          _id: '$trangthai',
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ['$sotien', 0] } }
        }
      },
      { $sort: { count: -1 } }
    ]),
    PhieuXuatKho.aggregate([
      {
        $project: {
          tongdoanhthu: { $ifNull: ['$tongdoanhthu', 0] },
          tonggiavon: { $ifNull: ['$tonggiavon', 0] },
          tongloinhuan: { $ifNull: ['$tongloinhuan', 0] },
          tongsoluong: { $ifNull: ['$tongsoluong', 0] },
          returnedQty: {
            $sum: {
              $map: {
                input: { $ifNull: ['$chitiet', []] },
                as: 'line',
                in: { $ifNull: ['$$line.soluonghoan', 0] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$tongdoanhthu' },
          totalCOGS: { $sum: '$tonggiavon' },
          totalProfit: { $sum: '$tongloinhuan' },
          totalSoldItems: { $sum: '$tongsoluong' },
          totalReturnedItems: { $sum: '$returnedQty' },
          totalExportOrders: { $sum: 1 }
        }
      }
    ]),
    Coupon.countDocuments({
      daxoa: { $ne: true },
      trangthai: 'active',
      ngay_batdau: { $lte: now },
      ngay_ketthuc: { $gte: now }
    }),
    TonKhoLo.aggregate([
      { $match: { soluongconlai: { $gt: 0 } } },
      {
        $group: {
          _id: '$sanphamid',
          totalRemain: { $sum: { $ifNull: ['$soluongconlai', 0] } },
          avgImportPrice: { $avg: { $ifNull: ['$gianhap', 0] } }
        }
      },
      { $sort: { totalRemain: 1 } },
      { $limit: 10 },
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
          productId: '$_id',
          name: '$product.tensanpham',
          totalRemain: 1,
          avgImportPrice: 1
        }
      }
    ])
  ]);

  const lowStock = (lowStockProducts || [])
    .map((p) => ({
      productId: String(p._id || ''),
      name: p.tensanpham || 'Sản phẩm',
      stock: getProductStock(p)
    }))
    .filter((p) => p.stock <= 10)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 12);

  const revenueToday = revenueTodayRows && revenueTodayRows[0] ? revenueTodayRows[0] : { revenue: 0, orders: 0 };
  const exportStatsRaw = exportRows && exportRows[0] ? exportRows[0] : {
    totalRevenue: 0,
    totalCOGS: 0,
    totalProfit: 0,
    totalSoldItems: 0,
    totalReturnedItems: 0,
    totalExportOrders: 0
  };
  const exportStats = normalizeExportStats(exportStatsRaw);

  const [
    periodRevenueRows,
    orderStatusPeriodRows,
    topProductsPeriodRows,
    topCustomersPeriodRows,
    recentOrdersInPeriod,
    paymentMethodPeriodRows,
    paymentStatusPeriodRows
  ] = await Promise.all([
    Donhang.aggregate([
      {
        $match: {
          daxoa: { $ne: true },
          ngaytao: { $gte: periodStart, $lt: periodEnd }
        }
      },
      {
        $group: {
          _id: null,
          revenue: {
            $sum: {
              $cond: [
                { $ne: ['$trangthai', 'dahuy'] },
                { $ifNull: ['$tongtien', 0] },
                0
              ]
            }
          },
          orders: { $sum: 1 },
          validOrders: {
            $sum: {
              $cond: [{ $ne: ['$trangthai', 'dahuy'] }, 1, 0]
            }
          }
        }
      }
    ]),
    Donhang.aggregate([
      {
        $match: {
          daxoa: { $ne: true },
          ngaytao: { $gte: periodStart, $lt: periodEnd }
        }
      },
      { $group: { _id: '$trangthai', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Chitietdonhang.aggregate([
      { $match: { ngaytao: { $gte: periodStart, $lt: periodEnd } } },
      {
        $group: {
          _id: '$sanpham_id',
          sold: { $sum: { $ifNull: ['$soluong', 0] } },
          revenue: { $sum: { $ifNull: ['$thanhtien', 0] } },
          name: { $first: '$tensanpham' }
        }
      },
      { $sort: { sold: -1, revenue: -1 } },
      { $limit: 10 }
    ]),
    Donhang.aggregate([
      {
        $match: {
          daxoa: { $ne: true },
          trangthai: { $ne: 'dahuy' },
          ngaytao: { $gte: periodStart, $lt: periodEnd }
        }
      },
      {
        $group: {
          _id: '$nguoidung_id',
          orders: { $sum: 1 },
          spend: { $sum: { $ifNull: ['$tongtien', 0] } }
        }
      },
      { $sort: { spend: -1, orders: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ['$user.hoten', '$user.tennguoidung'] },
          email: '$user.email',
          orders: 1,
          spend: 1
        }
      }
    ]),
    Donhang.find({ daxoa: { $ne: true }, ngaytao: { $gte: periodStart, $lt: periodEnd } })
      .select('madonhang tennguoinhan nguoidung_hoten trangthai tongtien phuongthucthanhtoan ngaytao')
      .sort({ ngaytao: -1 })
      .limit(15)
      .lean(),
    Thanhtoan.aggregate([
      { $match: { ngaytao: { $gte: periodStart, $lt: periodEnd } } },
      {
        $group: {
          _id: '$phuongthuc',
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ['$sotien', 0] } }
        }
      },
      { $sort: { total: -1 } }
    ]),
    Thanhtoan.aggregate([
      { $match: { ngaytao: { $gte: periodStart, $lt: periodEnd } } },
      {
        $group: {
          _id: '$trangthai',
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ['$sotien', 0] } }
        }
      },
      { $sort: { count: -1 } }
    ])
  ]);

  const periodRevenue = periodRevenueRows && periodRevenueRows[0] ? periodRevenueRows[0] : {
    revenue: 0,
    orders: 0,
    validOrders: 0
  };

  return {
    generatedAt: new Date().toISOString(),
    question: String(question || ''),
    period: {
      type: period.type,
      label: period.label,
      start: periodStart,
      end: periodEnd
    },
    summary: {
      products: Number(productCounts[0] || 0),
      activeProducts: Number(productCounts[1] || 0),
      inactiveProducts: Number(productCounts[2] || 0),
      users: Number(userCount || 0),
      orders: Number(orderCount || 0),
      activeVouchers: Number(activeVoucherCount || 0)
    },
    revenue: {
      inPeriod: {
        revenue: Number(periodRevenue.revenue || 0),
        orders: Number(periodRevenue.orders || 0),
        validOrders: Number(periodRevenue.validOrders || 0)
      },
      today: {
        revenue: Number(revenueToday.revenue || 0),
        orders: Number(revenueToday.orders || 0)
      },
      sevenDays: (revenue7DaysRows || []).map((item) => ({
        day: item && item._id ? item._id.day : '',
        revenue: Number(item && item.revenue ? item.revenue : 0),
        orders: Number(item && item.orders ? item.orders : 0)
      })),
      exportStats: {
        totalRevenue: Number(exportStats.totalRevenue || 0),
        totalCOGS: Number(exportStats.totalCOGS || 0),
        totalProfit: Number(exportStats.totalProfit || 0),
        totalSoldItems: Number(exportStats.totalSoldItems || 0),
        totalReturnedItems: Number(exportStats.totalReturnedItems || 0),
        totalExportOrders: Number(exportStats.totalExportOrders || 0)
      }
    },
    orders: {
      byStatusInPeriod: (orderStatusPeriodRows || []).map((item) => ({
        status: String(item && item._id ? item._id : 'unknown'),
        count: Number(item && item.count ? item.count : 0)
      })),
      byStatus: (orderStatusRows || []).map((item) => ({
        status: String(item && item._id ? item._id : 'unknown'),
        count: Number(item && item.count ? item.count : 0)
      })),
      recentInPeriod: (recentOrdersInPeriod || []).map((item) => ({
        orderCode: item.madonhang || '',
        customerName: item.tennguoinhan || item.nguoidung_hoten || '',
        status: item.trangthai || '',
        paymentMethod: item.phuongthucthanhtoan || '',
        amount: Number(item.tongtien || 0),
        createdAt: item.ngaytao
      })),
      recent: (recentOrders || []).map((item) => ({
        orderCode: item.madonhang || '',
        customerName: item.tennguoinhan || item.nguoidung_hoten || '',
        status: item.trangthai || '',
        paymentMethod: item.phuongthucthanhtoan || '',
        amount: Number(item.tongtien || 0),
        createdAt: item.ngaytao
      }))
    },
    products: {
      topSellingInPeriod: (topProductsPeriodRows || []).map((item) => ({
        productId: String(item && item._id ? item._id : ''),
        name: item && item.name ? item.name : 'Sản phẩm',
        sold: Number(item && item.sold ? item.sold : 0),
        revenue: Number(item && item.revenue ? item.revenue : 0)
      })),
      topSelling30Days: (topProductsRows || []).map((item) => ({
        productId: String(item && item._id ? item._id : ''),
        name: item && item.name ? item.name : 'Sản phẩm',
        sold: Number(item && item.sold ? item.sold : 0),
        revenue: Number(item && item.revenue ? item.revenue : 0)
      })),
      lowStock,
      lotRemainRisk: (inventoryLotRows || []).map((item) => ({
        productId: String(item && item.productId ? item.productId : ''),
        name: item && item.name ? item.name : 'Sản phẩm',
        totalRemain: Number(item && item.totalRemain ? item.totalRemain : 0),
        avgImportPrice: Number(item && item.avgImportPrice ? item.avgImportPrice : 0)
      }))
    },
    customers: {
      topSpendersInPeriod: (topCustomersPeriodRows || []).map((item) => ({
        name: item && item.name ? item.name : '',
        email: item && item.email ? item.email : '',
        orders: Number(item && item.orders ? item.orders : 0),
        spend: Number(item && item.spend ? item.spend : 0)
      })),
      topSpenders30Days: (topCustomersRows || []).map((item) => ({
        name: item && item.name ? item.name : '',
        email: item && item.email ? item.email : '',
        orders: Number(item && item.orders ? item.orders : 0),
        spend: Number(item && item.spend ? item.spend : 0)
      }))
    },
    payments: {
      byMethodInPeriod: (paymentMethodPeriodRows || []).map((item) => ({
        method: String(item && item._id ? item._id : 'unknown'),
        count: Number(item && item.count ? item.count : 0),
        total: Number(item && item.total ? item.total : 0)
      })),
      byMethod30Days: (paymentMethodRows || []).map((item) => ({
        method: String(item && item._id ? item._id : 'unknown'),
        count: Number(item && item.count ? item.count : 0),
        total: Number(item && item.total ? item.total : 0)
      })),
      byStatusInPeriod: (paymentStatusPeriodRows || []).map((item) => ({
        status: String(item && item._id ? item._id : 'unknown'),
        count: Number(item && item.count ? item.count : 0),
        total: Number(item && item.total ? item.total : 0)
      })),
      byStatus30Days: (paymentStatusRows || []).map((item) => ({
        status: String(item && item._id ? item._id : 'unknown'),
        count: Number(item && item.count ? item.count : 0),
        total: Number(item && item.total ? item.total : 0)
      }))
    }
  };
}

async function getDashboardPageData() {
  const tongsanpham = await sanpham.countDocuments({ daxoa: false });
  const sanphamdangban = await sanpham.countDocuments({ daxoa: false, trangthai: 'dangban' });
  const sanphamngungban = await sanpham.countDocuments({ daxoa: false, trangthai: 'ngungban' });

  const tatcasanpham = await sanpham.find({ daxoa: false, trangthai: 'dangban' }).lean();
  let sosanphamhethang = 0;
  tatcasanpham.forEach(p => {
    let tongton = 0;
    if (p.sizes && p.sizes.length) {
      p.sizes.forEach(s => { tongton += (s.soluong || 0); });
    }
    if (p.bienthe && p.bienthe.length) {
      p.bienthe.forEach(bt => {
        if (bt.sizes && bt.sizes.length) {
          bt.sizes.forEach(s => { tongton += (s.soluong || 0); });
        }
      });
    }
    if (tongton === 0) sosanphamhethang++;
  });

  const sanphammoihat = await sanpham.find({ daxoa: false })
    .sort({ ngaytao: -1 })
    .limit(5)
    .lean();

  const thongketheoloai = await sanpham.aggregate([
    { $match: { daxoa: false } },
    { $group: { _id: '$loaisanpham', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const thongketheogioitinh = await sanpham.aggregate([
    { $match: { daxoa: false } },
    { $group: { _id: '$gioitinh', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const exportAgg = await PhieuXuatKho.aggregate([
    {
      $project: {
        tongdoanhthu: { $ifNull: ['$tongdoanhthu', 0] },
        tonggiavon: { $ifNull: ['$tonggiavon', 0] },
        tongloinhuan: { $ifNull: ['$tongloinhuan', 0] },
        tongsoluong: { $ifNull: ['$tongsoluong', 0] },
        returnedQty: {
          $sum: {
            $map: {
              input: { $ifNull: ['$chitiet', []] },
              as: 'line',
              in: { $ifNull: ['$$line.soluonghoan', 0] }
            }
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        tongDoanhThu: { $sum: '$tongdoanhthu' },
        tongGiaVon: { $sum: '$tonggiavon' },
        tongLoiNhuan: { $sum: '$tongloinhuan' },
        tongSanPhamDaBan: { $sum: '$tongsoluong' },
        tongSanPhamDaHoan: { $sum: '$returnedQty' },
        tongPhieuXuat: { $sum: 1 }
      }
    }
  ]);

  const exportStatsRaw = exportAgg && exportAgg.length ? exportAgg[0] : {
    tongDoanhThu: 0,
    tongGiaVon: 0,
    tongLoiNhuan: 0,
    tongSanPhamDaBan: 0,
    tongSanPhamDaHoan: 0,
    tongPhieuXuat: 0
  };
  const exportStats = {
    tongDoanhThu: Number(exportStatsRaw.tongDoanhThu || 0),
    tongGiaVon: Number(exportStatsRaw.tongGiaVon || 0),
    tongLoiNhuan: Number(exportStatsRaw.tongLoiNhuan || 0) || (Number(exportStatsRaw.tongDoanhThu || 0) - Number(exportStatsRaw.tongGiaVon || 0)),
    tongSanPhamDaBan: Math.max(0, Number(exportStatsRaw.tongSanPhamDaBan || 0) - Number(exportStatsRaw.tongSanPhamDaHoan || 0)),
    tongPhieuXuat: Number(exportStatsRaw.tongPhieuXuat || 0)
  };

  let syncedFinancialStats = null;
  try {
    const currentYear = new Date().getFullYear();
    const reportData = await reportsAdminService.getDuLieuBaoCao({
      status: 'all',
      year: currentYear
    });

    if (reportData && reportData.success && reportData.overview) {
      syncedFinancialStats = {
        totalRevenue: Number(reportData.overview.totalRevenue || 0),
        totalCOGS: Number(reportData.overview.totalCost || 0),
        totalProfit: Number(reportData.overview.profit || 0),
        totalSoldItems: Number(reportData.overview.totalSold || 0),
        totalExportOrders: Number(reportData.overview.totalOrders || 0),
        profitMarginPct: Number(reportData.overview.profitMargin || 0)
      };
    }
  } catch (error) {
    console.error('Dashboard sync with reports failed:', error);
  }

  const tySuatLoiNhuan = Number(exportStats.tongDoanhThu || 0) > 0
    ? (Number(exportStats.tongLoiNhuan || 0) / Number(exportStats.tongDoanhThu || 0)) * 100
    : 0;
  const financialStats = syncedFinancialStats || {
    totalRevenue: Number(exportStats.tongDoanhThu || 0),
    totalCOGS: Number(exportStats.tongGiaVon || 0),
    totalProfit: Number(exportStats.tongLoiNhuan || 0),
    totalSoldItems: Number(exportStats.tongSanPhamDaBan || 0),
    totalExportOrders: Number(exportStats.tongPhieuXuat || 0),
    profitMarginPct: Number(tySuatLoiNhuan.toFixed(2))
  };

  return {
    titlePage: 'Dashboard - Admin',
    stats: {
      totalProducts: tongsanpham,
      activeProducts: sanphamdangban,
      inactiveProducts: sanphamngungban,
      outOfStockCount: sosanphamhethang,
      totalRevenue: Number(financialStats.totalRevenue || 0),
      totalCOGS: Number(financialStats.totalCOGS || 0),
      totalProfit: Number(financialStats.totalProfit || 0),
      totalSoldItems: Number(financialStats.totalSoldItems || 0),
      totalExportOrders: Number(financialStats.totalExportOrders || 0),
      profitMarginPct: Number(financialStats.profitMarginPct || 0)
    },
    recentProducts: sanphammoihat,
    productsByType: thongketheoloai,
    productsByGender: thongketheogioitinh
  };
}

function getDashboardFallbackData() {
  return {
    titlePage: 'Dashboard - Admin',
    stats: {
      totalProducts: 0,
      activeProducts: 0,
      inactiveProducts: 0,
      outOfStockCount: 0,
      totalRevenue: 0,
      totalCOGS: 0,
      totalProfit: 0,
      totalSoldItems: 0,
      totalExportOrders: 0,
      profitMarginPct: 0
    },
    recentProducts: [],
    productsByType: [],
    productsByGender: []
  };
}

function getAiAssistantPageData() {
  return {
    titlePage: 'AI Assistant - Admin'
  };
}

async function askAdminAssistant({ question, provider, model, history }) {
  const cleanQuestion = String(question || '').trim();
  const selectedProvider = String(provider || 'ollama').trim().toLowerCase() || 'ollama';
  const selectedModel = String(model || '').trim();

  if (!cleanQuestion) {
    return { ok: false, status: 400, message: 'Vui lòng nhập câu hỏi cho AI.' };
  }

  const stockAnswer = await buildAdminStockAnswer(cleanQuestion);
  if (stockAnswer) {
    return {
      ok: true,
      status: 200,
      data: {
        answer: stockAnswer,
        provider: 'system',
        model: 'admin-stock-path',
        contextMeta: {
          topSelling30Days: 0,
          lowStock: 0,
          topCustomers30Days: 0,
          recentOrders: 0
        }
      }
    };
  }

  const context = await buildAdminDataContext(cleanQuestion);
  const ai = await askAI({
    question: cleanQuestion,
    history: normalizeHistory(history),
    context,
    provider: selectedProvider,
    model: selectedModel,
    systemPrompt: buildAdminSystemPrompt()
  });

  return {
    ok: true,
    status: 200,
    data: {
      answer: cleanAdminAnswer(String(ai && ai.content ? ai.content : '').trim()),
      provider: ai && ai.provider ? ai.provider : selectedProvider,
      model: ai && ai.model ? ai.model : selectedModel,
      contextMeta: {
        topSelling30Days: Array.isArray(context.products && context.products.topSelling30Days)
          ? context.products.topSelling30Days.length
          : 0,
        lowStock: Array.isArray(context.products && context.products.lowStock)
          ? context.products.lowStock.length
          : 0,
        topCustomers30Days: Array.isArray(context.customers && context.customers.topSpenders30Days)
          ? context.customers.topSpenders30Days.length
          : 0,
        recentOrders: Array.isArray(context.orders && context.orders.recent)
          ? context.orders.recent.length
          : 0
      }
    }
  };
}

function mapAdminAiError(error, selectedProvider = 'ollama') {
  const msg = String(error && error.message ? error.message : 'Lỗi không xác định');
  const provider = String(selectedProvider || 'ollama').trim().toLowerCase() || 'ollama';

  if (msg.includes('GEMINI_API_KEY_MISSING')) {
    return {
      status: 503,
      message: 'Chưa cấu hình Gemini API key. Vui lòng thêm GEMINI_API_KEY trong .env.'
    };
  }

  if (msg.includes('OPENROUTER_API_KEY_MISSING')) {
    return {
      status: 503,
      message: 'Chưa cấu hình OpenRouter API key. Vui lòng thêm OPENROUTER_API_KEY trong .env.'
    };
  }

  const lower = msg.toLowerCase();
  if (lower.includes('developer instruction is not enabled')) {
    return {
      status: 503,
      message: 'Model Gemini hiện tại chưa được bật cho API key này. Hệ thống sẽ ưu tiên dùng gemini-2.5-flash nếu có thể.'
    };
  }

  const isConnectionError = lower.includes('fetch failed')
    || lower.includes('econnrefused')
    || lower.includes('abort')
    || lower.includes('timed out')
    || lower.includes('timeout');

  if (isConnectionError) {
    if (provider === 'gemini') {
      return {
        status: 503,
        message: 'Không kết nối được Gemini hoặc phản hồi quá chậm. Vui lòng thử lại sau ít giây.'
      };
    }

    if (provider === 'openrouter') {
      return {
        status: 503,
        message: 'Không kết nối được OpenRouter hoặc phản hồi quá chậm. Vui lòng thử lại sau ít giây.'
      };
    }

    return {
      status: 503,
      message: 'Không kết nối được Ollama. Hãy bật Ollama và pull model trước khi chat.'
    };
  }

  return {
    status: 500,
    message: 'Không thể xử lý câu hỏi AI lúc này.'
  };
}

module.exports = {
  getDashboardPageData,
  getDashboardFallbackData,
  getAiAssistantPageData,
  askAdminAssistant,
  mapAdminAiError
};
