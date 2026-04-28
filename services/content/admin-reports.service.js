const Chitietdonhang = require('../../models/order_item_model');
const Donhang = require('../../models/order_model');
const Sanpham = require('../../models/product_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const { ganThongTinHoanHangChoDanhSachDon } = require('../order/order-sidecar.service.js');
const { nhantrangthai, layTrangThaiChoPhep } = require('../../helpers/orderStatus');

const STATUS_CHOICES = layTrangThaiChoPhep();
const STATUS_SET = new Set(STATUS_CHOICES);
const DEFAULT_STATUS = 'all';

const POST_DELIVERY_FLOW_STATUSES = [
  'dagiao',
  'requested_return',
  'approved_return',
  'rejected_return',
  'return_shipping',
  'returned',
  'returned_full',
  'returned_partial',
  'refunded'
];

// Bao gồm cả các trạng thái đã xác nhận/xuất kho để doanh thu dashboard
// phản ánh ngay sau khi đơn được xác nhận tạo phiếu xuất.
// NOTE: Default revenue now excludes pre-delivery states such as
// daxacnhan, dangchuanbi, and danggiao.
const REVENUE_RECOGNIZED_STATUSES = [
  ...POST_DELIVERY_FLOW_STATUSES
];

const MANUAL_EXPORT_STATUS = 'manual_export';

const FINALIZED_RETURN_STATUSES = new Set([
  'returned',
  'returned_full',
  'returned_partial',
  'refunded'
]);

// Parse số nguyên trong khoảng cho phép.
function parseNumber(value, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) return null;
  if (max != null && n > max) return null;
  return n;
}

// Parse chuỗi ngày, trả null nếu không hợp lệ.
function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Lấy mốc đầu ngày.
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Lấy mốc cuối ngày.
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Chuẩn hóa trạng thái lọc báo cáo.
function normalizeStatus(raw) {
  const v = String(raw || '').trim();
  if (!v) return DEFAULT_STATUS;
  if (!STATUS_SET.has(v)) return DEFAULT_STATUS;
  return v;
}

// Dựng khoảng thời gian báo cáo từ query.
function buildDateRange(query) {
  const now = new Date();
  const fromDate = parseDate(query.fromDate);
  const toDate = parseDate(query.toDate);
  const month = parseNumber(query.month, 1, 12);
  const year = parseNumber(query.year, 2000, now.getFullYear() + 1);
  const resolvedYear = year || now.getFullYear();

  let from = null;
  let to = null;
  let mode = 'year';

  if (fromDate || toDate) {
    from = fromDate ? startOfDay(fromDate) : startOfDay(new Date(now.getFullYear(), 0, 1));
    to = toDate ? endOfDay(toDate) : endOfDay(new Date(now.getFullYear(), 11, 31));
    mode = 'custom';
  } else if (month) {
    from = startOfDay(new Date(resolvedYear, month - 1, 1));
    to = endOfDay(new Date(resolvedYear, month, 0));
    mode = 'month';
  } else if (year) {
    from = startOfDay(new Date(year, 0, 1));
    to = endOfDay(new Date(year, 11, 31));
    mode = 'year';
  } else {
    from = startOfDay(new Date(now.getFullYear(), 0, 1));
    to = endOfDay(new Date(now.getFullYear(), 11, 31));
    mode = 'year';
  }

  return {
    from,
    to,
    mode,
    month: month || null,
    year: year || now.getFullYear()
  };
}

// Dựng khoảng thời gian kỳ trước để so sánh tăng trưởng.
function buildPreviousRange(range) {
  if (!range || !range.from || !range.to) return null;

  if (range.mode === 'month' && range.month && range.year) {
    const prevMonth = range.month === 1 ? 12 : range.month - 1;
    const prevYear = range.month === 1 ? range.year - 1 : range.year;
    return {
      from: startOfDay(new Date(prevYear, prevMonth - 1, 1)),
      to: endOfDay(new Date(prevYear, prevMonth, 0))
    };
  }

  if (range.mode === 'year' && range.year) {
    const prevYear = range.year - 1;
    return {
      from: startOfDay(new Date(prevYear, 0, 1)),
      to: endOfDay(new Date(prevYear, 11, 31))
    };
  }

  const span = range.to.getTime() - range.from.getTime();
  const prevEnd = new Date(range.from.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);
  return {
    from: startOfDay(prevStart),
    to: endOfDay(prevEnd)
  };
}

// Padding 2 chữ số.
function pad2(value) {
  return String(value).padStart(2, '0');
}

// Format nhãn thời gian theo cấp ngày/tháng/năm.
function formatDateLabel(date, groupBy) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  if (groupBy === 'day') return `${y}-${m}-${d}`;
  if (groupBy === 'year') return `${y}`;
  return `${y}-${m}`;
}

// Xác định cấp nhóm dữ liệu biểu đồ theo khoảng thời gian.
function resolveGroupBy(raw, range) {
  const value = String(raw || '').trim().toLowerCase();
  if (['day', 'month', 'year'].includes(value)) return value;

  const span = range.to.getTime() - range.from.getTime();
  const days = Math.ceil(span / (24 * 60 * 60 * 1000)) + 1;
  if (days <= 31) return 'day';
  if (days <= 370) return 'month';
  return 'year';
}

// Tạo danh sách nhãn thời gian liên tục cho biểu đồ.
function buildTimeLabels(from, to, groupBy) {
  const labels = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  while (cursor <= end) {
    labels.push(formatDateLabel(cursor, groupBy));
    if (groupBy === 'day') {
      cursor.setDate(cursor.getDate() + 1);
    } else if (groupBy === 'year') {
      cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
    } else {
      cursor.setMonth(cursor.getMonth() + 1, 1);
    }
  }

  return labels;
}

// Map trạng thái đơn hàng sang class badge hiển thị.
function buildStatusClass(status) {
  switch (status) {
    case 'choxacnhan':
      return 'bg-warning text-dark';
    case 'daxacnhan':
      return 'bg-primary';
    case 'dangchuanbi':
      return 'bg-info text-dark';
    case 'danggiao':
      return 'bg-warning';
    case 'dagiao':
      return 'bg-success';
    case 'requested_return':
      return 'bg-warning text-dark';
    case 'approved_return':
      return 'bg-info text-dark';
    case 'rejected_return':
      return 'bg-danger';
    case 'return_shipping':
      return 'bg-primary';
    case 'returned':
    case 'returned_partial':
      return 'bg-secondary';
    case 'returned_full':
      return 'bg-success';
    case 'refunded':
      return 'bg-dark';
    case 'dahuy':
      return 'bg-danger';
    case 'hoanhang':
      return 'bg-secondary';
    case MANUAL_EXPORT_STATUS:
      return 'bg-info text-dark';
    default:
      return 'bg-secondary';
  }
}

// Tạo điều kiện match đơn hàng cho báo cáo.
function buildOrderMatch(filters, range, options = {}) {
  const prefix = String(options.prefix || '');
  const path = (field) => `${prefix}${field}`;

  const match = {
    [path('daxoa')]: { $ne: true }
  };

  if (filters.status && filters.status !== 'all') {
    // "Đã giao" trên báo cáo nên bao gồm cả các trạng thái sau giao hàng
    // để không làm mất doanh thu ròng của đơn đã hoàn một phần/hoàn tiền.
    if (filters.status === 'dagiao') {
      match[path('trangthai')] = { $in: POST_DELIVERY_FLOW_STATUSES };
    } else {
      match[path('trangthai')] = filters.status;
    }
  } else {
    // Mặc định báo cáo doanh thu theo các đơn đã giao trở đi.
    match[path('trangthai')] = { $in: REVENUE_RECOGNIZED_STATUSES };
  }

  if (range && range.from && range.to) {
    match[path('ngaytao')] = { $gte: range.from, $lte: range.to };
  }

  return match;
}

function toObjectIdString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && value._id) return String(value._id).trim();
  return String(value).trim();
}

function isValidObjectIdString(value) {
  const v = String(value || '').trim();
  return /^[a-fA-F0-9]{24}$/.test(v);
}

function getManualExportDate(receipt) {
  if (receipt?.ngayxuat) return new Date(receipt.ngayxuat);
  if (receipt?.ngaytao) return new Date(receipt.ngaytao);
  return null;
}

function normalizeManualLineMetrics(line) {
  const soldQty = Math.max(0, Number(line?.soluong || 0));
  const returnedQty = Math.max(0, Number(line?.soluonghoan || 0));
  const qty = Math.max(0, soldQty - returnedQty);

  const soldRevenue = Math.max(0, Number(line?.doanhthu || 0));
  const returnedRevenue = Math.max(0, Number(line?.doanhthuhoan || 0));
  const revenue = Math.max(0, soldRevenue - returnedRevenue);

  const soldCost = Math.max(0, Number(line?.giavon || 0));
  const returnedCost = Math.max(0, Number(line?.giavonhoan || 0));
  const cost = Math.max(0, soldCost - returnedCost);

  return { qty, revenue, cost };
}

function createEmptyManualExportMetrics() {
  return {
    totalRevenue: 0,
    totalCost: 0,
    totalQty: 0,
    totalOrders: 0,
    revenueByBucket: new Map(),
    costByBucket: new Map(),
    productMap: new Map(),
    rows: []
  };
}

async function buildManualExportMetrics(filters, range, groupBy) {
  const out = createEmptyManualExportMetrics();
  if (!filters || (filters.status && filters.status !== 'all')) return out;

  const match = {
    nguoitaophieu: 'manual',
    $or: [
      { donhang_id: { $exists: false } },
      { donhang_id: null }
    ]
  };

  if (range && range.from && range.to) {
    match.ngayxuat = { $gte: range.from, $lte: range.to };
  }

  const receipts = await PhieuXuatKho.find(match)
    .select('_id maphieu madonhang ngayxuat ngaytao tongdoanhthu tonggiavon tongloinhuan tongsoluong chitiet')
    .lean();

  if (!receipts || !receipts.length) return out;

  let categoryMap = null;
  const category = String(filters.category || '').trim();
  if (category) {
    const productIds = new Set();
    receipts.forEach((receipt) => {
      (Array.isArray(receipt?.chitiet) ? receipt.chitiet : []).forEach((line) => {
        const id = toObjectIdString(line?.sanphamid);
        if (isValidObjectIdString(id)) productIds.add(id);
      });
    });

    const ids = Array.from(productIds);
    if (ids.length) {
      const products = await Sanpham.find({ _id: { $in: ids } })
        .select('_id loaisanpham')
        .lean();
      categoryMap = new Map();
      (products || []).forEach((product) => {
        categoryMap.set(String(product?._id || ''), String(product?.loaisanpham || '').trim());
      });
    } else {
      categoryMap = new Map();
    }
  }

  receipts.forEach((receipt) => {
    const receiptDate = getManualExportDate(receipt);
    if (!receiptDate || Number.isNaN(receiptDate.getTime())) return;

    const lines = Array.isArray(receipt?.chitiet) ? receipt.chitiet : [];
    if (!lines.length) return;

    let receiptRevenue = 0;
    let receiptCost = 0;
    let receiptQty = 0;

    lines.forEach((line) => {
      const productId = toObjectIdString(line?.sanphamid);
      if (category) {
        const lineCategory = categoryMap ? String(categoryMap.get(productId) || '') : '';
        if (lineCategory !== category) return;
      }

      const metrics = normalizeManualLineMetrics(line);
      if (metrics.qty <= 0 && metrics.revenue <= 0 && metrics.cost <= 0) return;

      receiptQty += metrics.qty;
      receiptRevenue += metrics.revenue;
      receiptCost += metrics.cost;

      const productKey = productId || String(line?.tensanpham || '').trim() || 'manual_product';
      if (!out.productMap.has(productKey)) {
        out.productMap.set(productKey, {
          id: productId,
          name: String(line?.tensanpham || 'Sản phẩm'),
          qty: 0
        });
      }
      out.productMap.get(productKey).qty += metrics.qty;
    });

    if (receiptQty <= 0 && receiptRevenue <= 0 && receiptCost <= 0) return;

    out.totalRevenue += receiptRevenue;
    out.totalCost += receiptCost;
    out.totalQty += receiptQty;
    out.totalOrders += 1;

    const label = formatDateLabel(receiptDate, groupBy);
    out.revenueByBucket.set(label, (out.revenueByBucket.get(label) || 0) + receiptRevenue);
    out.costByBucket.set(label, (out.costByBucket.get(label) || 0) + receiptCost);

    const receiptId = String(receipt?._id || '');
    const orderCode = String(receipt?.madonhang || receipt?.maphieu || receiptId || '').trim();

    out.rows.push({
      id: receiptId,
      orderCode,
      orderDate: receiptDate,
      customerName: 'Xuất kho nội bộ',
      revenue: receiptRevenue,
      cost: receiptCost,
      profit: receiptRevenue - receiptCost,
      status: MANUAL_EXPORT_STATUS,
      statusLabel: 'Xuất kho',
      statusClass: buildStatusClass(MANUAL_EXPORT_STATUS),
      detailUrl: `/admin/exports/${receiptId}`
    });
  });

  return out;
}

// Dựng timeline giá nhập theo sản phẩm/biến thể/size.
async function buildCostTimeline() {
  const rows = await PhieuNhapKho.aggregate([
    { $unwind: '$chitiet' },
    {
      $project: {
        sanphamid: '$chitiet.sanphamid',
        bientheid: '$chitiet.bientheid',
        kichco: '$chitiet.kichco',
        gianhap: '$chitiet.gianhap',
        ngaynhap: '$ngaynhap'
      }
    },
    { $sort: { ngaynhap: 1 } }
  ]);

  const map = new Map();
  rows.forEach((row) => {
    const sanphamid = row.sanphamid ? String(row.sanphamid) : '';
    const bientheid = row.bientheid ? String(row.bientheid) : 'main';
    const kichco = row.kichco ? String(row.kichco) : 'nosize';
    const key = `${sanphamid}|${bientheid}|${kichco}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      date: row.ngaynhap ? new Date(row.ngaynhap) : null,
      cost: Number(row.gianhap || 0)
    });
  });

  return map;
}

// Lấy giá vốn tại thời điểm đơn hàng từ timeline nhập kho.
function resolveCostAtDate(costTimeline, item, orderDate) {
  if (!costTimeline || costTimeline.size === 0) return 0;
  const productId = item.productId ? String(item.productId) : '';
  const variantId = item.variantId ? String(item.variantId) : 'main';
  const size = item.size ? String(item.size) : 'nosize';
  const key = `${productId}|${variantId}|${size}`;
  const fallbackKey = `${productId}|main|nosize`;
  const timeline = costTimeline.get(key) || costTimeline.get(fallbackKey) || [];
  if (!timeline.length) return 0;

  let resolved = 0;
  const targetTime = orderDate ? new Date(orderDate).getTime() : null;
  timeline.forEach((row) => {
    if (!row.date || !targetTime || row.date.getTime() <= targetTime) {
      resolved = row.cost;
    }
  });

  return resolved;
}

// Ép số dương, âm hoặc lỗi trả 0.
function toPositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

// Tính giá vốn từ snapshot FIFO của order item.
function calcFifoCostFromItem(item) {
  const rows = Array.isArray(item?.fifoAllocations) ? item.fifoAllocations : [];
  if (!rows.length) {
    return {
      hasFifo: false,
      qtyFromFifo: 0,
      costFromFifo: 0
    };
  }

  let qtyFromFifo = 0;
  let costFromFifo = 0;

  rows.forEach((row) => {
    const soLuong = toPositiveNumber(row?.soLuong);
    if (soLuong <= 0) return;

    const giaNhap = Math.max(0, Number(row?.giaNhap || 0));
    qtyFromFifo += soLuong;
    costFromFifo += (soLuong * giaNhap);
  });

  return {
    hasFifo: qtyFromFifo > 0,
    qtyFromFifo,
    costFromFifo
  };
}

// Dựng pipeline aggregate lấy item + order + product cho báo cáo.
function buildItemPipeline(filters, range) {
  const orderMatch = buildOrderMatch(filters, range, { prefix: 'order.' });

  const pipeline = [
    {
      $lookup: {
        from: 'orders',
        localField: 'donhang_id',
        foreignField: '_id',
        as: 'order'
      }
    },
    { $unwind: '$order' },
    { $match: orderMatch },
    {
      $lookup: {
        from: 'products',
        localField: 'sanpham_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }
  ];

  if (filters.category) {
    pipeline.push({
      $match: { 'product.loaisanpham': filters.category }
    });
  }

  pipeline.push({
    $addFields: {
      itemRevenue: {
        $ifNull: ['$thanhtien', { $multiply: ['$giaban', '$soluong'] }]
      }
    }
  });

  pipeline.push({
    $project: {
      itemId: '$_id',
      orderId: '$donhang_id',
      itemQty: '$soluong',
      itemRevenue: 1,
      fifoAllocations: { $ifNull: ['$fifoAllocations', []] },
      productName: { $ifNull: ['$tensanpham', '$product.tensanpham'] },
      productId: '$sanpham_id',
      variantId: '$bienthe_id',
      size: '$kichco'
    }
  });

  return pipeline;
}

// Xác định giá vốn hàng trả từ dữ liệu hoàn.
function resolveReturnedCost({ cost, revenue, profit }) {
  const directCost = toPositiveNumber(cost);
  if (directCost > 0) return directCost;

  const safeRevenue = toPositiveNumber(revenue);
  const safeProfit = Number.isFinite(Number(profit)) ? Number(profit) : 0;
  return Math.max(0, safeRevenue - safeProfit);
}

// Tính doanh thu gốc của đơn trước khi trừ phần trả hàng.
function resolveBaseOrderRevenue(order, grossItemRevenue = 0) {
  const safeGrossItemRevenue = Math.max(0, Number(grossItemRevenue || 0));
  if (safeGrossItemRevenue > 0) {
    const discount = Math.min(toPositiveNumber(order?.giamgia), safeGrossItemRevenue);
    return Math.max(0, safeGrossItemRevenue - discount);
  }

  // Fallback when item snapshots are missing: use order total excluding shipping.
  const currentRevenue = Math.max(0, Number(order?.tongtien || 0));
  const shipping = toPositiveNumber(order?.phivanchuyen);
  return Math.max(0, currentRevenue - shipping);
}

// Tính doanh thu ròng của đơn sau điều chỉnh hàng trả.
function getOrderNetRevenue(order, returnsByOrder, metricsByOrder = {}) {
  const orderId = String(order?._id || '');
  const returned = returnsByOrder.get(orderId) || {};
  const returnedRevenue = toPositiveNumber(returned?.revenue);

  const grossRevenueMap = metricsByOrder.grossRevenueMap instanceof Map
    ? metricsByOrder.grossRevenueMap
    : null;

  const grossItemRevenue = grossRevenueMap
    ? Math.max(0, Number(grossRevenueMap.get(orderId) || 0))
    : 0;
  const baseRevenue = resolveBaseOrderRevenue(order, grossItemRevenue);
  if (returnedRevenue <= 0) return baseRevenue;

  // Preferred path: compute net product revenue from product totals.
  if (grossItemRevenue > 0) {
    return Math.max(0, baseRevenue - returnedRevenue);
  }

  // No item baseline available: tongtien in this flow is already net after return.
  return baseRevenue;
}

// Tổng hợp điều chỉnh hoàn trả theo đơn và theo sản phẩm.
async function buildReturnAdjustments(orderIds = [], options = {}) {
  const ids = Array.isArray(orderIds) ? orderIds.filter(Boolean) : [];
  const category = String(options.category || '').trim();
  const includeOrderFallback = Boolean(options.includeOrderFallback);
  const fallbackOrders = Array.isArray(options.orders) ? options.orders : [];

  const byOrder = new Map();
  const returnedQtyByProduct = new Map();

  if (ids.length) {
    const pipeline = [
      { $match: { donhang_id: { $in: ids } } },
      { $unwind: '$chitiet' },
      {
        $project: {
          orderId: '$donhang_id',
          productId: '$chitiet.sanphamid',
          returnedQty: { $ifNull: ['$chitiet.soluonghoan', 0] },
          returnedRevenue: { $ifNull: ['$chitiet.doanhthuhoan', 0] },
          returnedCostRaw: { $ifNull: ['$chitiet.giavonhoan', 0] },
          returnedProfit: { $ifNull: ['$chitiet.loinhuanhoan', 0] }
        }
      }
    ];

    if (category) {
      pipeline.push(
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: false } },
        { $match: { 'product.loaisanpham': category } }
      );
    }

    pipeline.push({
      $group: {
        _id: { orderId: '$orderId', productId: '$productId' },
        returnedQty: { $sum: '$returnedQty' },
        returnedRevenue: { $sum: '$returnedRevenue' },
        returnedCostRaw: { $sum: '$returnedCostRaw' },
        returnedProfit: { $sum: '$returnedProfit' }
      }
    });

    const rows = await PhieuXuatKho.aggregate(pipeline);

    rows.forEach((row) => {
      const orderId = String(row?._id?.orderId || '');
      if (!orderId) return;

      const revenue = toPositiveNumber(row?.returnedRevenue);
      const qty = toPositiveNumber(row?.returnedQty);
      const cost = resolveReturnedCost({
        cost: row?.returnedCostRaw,
        revenue: row?.returnedRevenue,
        profit: row?.returnedProfit
      });

      if (revenue <= 0 && qty <= 0 && cost <= 0) return;

      const entry = byOrder.get(orderId) || { revenue: 0, cost: 0, qty: 0 };
      entry.revenue += revenue;
      entry.cost += cost;
      entry.qty += qty;
      byOrder.set(orderId, entry);

      const productId = String(row?._id?.productId || '');
      if (productId && qty > 0) {
        returnedQtyByProduct.set(productId, (returnedQtyByProduct.get(productId) || 0) + qty);
      }
    });
  }

  // Backward-compatible fallback: some old orders only persist totals on the order document.
  if (includeOrderFallback && !category) {
    fallbackOrders.forEach((order) => {
      const orderId = String(order?._id || '');
      if (!orderId || byOrder.has(orderId)) return;

      const revenue = toPositiveNumber(order?.tonggiamdoanhthu_hoantra);
      const qty = toPositiveNumber(order?.tongsoluong_hoantra);
      const cost = resolveReturnedCost({
        cost: 0,
        revenue: order?.tonggiamdoanhthu_hoantra,
        profit: order?.tonggiamloinhuan_hoantra
      });

      if (revenue <= 0 && qty <= 0 && cost <= 0) return;
      byOrder.set(orderId, { revenue, cost, qty });
    });
  }

  return {
    byOrder,
    returnedQtyByProduct
  };
}

// Tính doanh thu ròng kỳ trước theo pipeline item (khi có lọc danh mục).
async function sumRevenueForRangeItems(filters, range) {
  const orderMatch = buildOrderMatch(filters, range);
  const orders = await Donhang.find(orderMatch)
    .select('_id')
    .lean();
  if (!orders || !orders.length) return 0;

  const orderIds = orders.map((order) => order._id);
  const rows = await Chitietdonhang.aggregate([
    { $match: { donhang_id: { $in: orderIds } } },
    ...buildItemPipeline(filters, range),
    {
      $group: {
        _id: null,
        total: { $sum: '$itemRevenue' }
      }
    }
  ]);

  const grossRevenue = rows && rows.length ? Number(rows[0].total || 0) : 0;
  const { byOrder } = await buildReturnAdjustments(orderIds, {
    category: filters.category,
    includeOrderFallback: false
  });
  const returnedRevenue = Array.from(byOrder.values())
    .reduce((sum, entry) => sum + toPositiveNumber(entry?.revenue), 0);

  return Math.max(0, grossRevenue - returnedRevenue);
}

// Tính doanh thu ròng kỳ trước theo cấp đơn hàng (toàn cục).
async function sumRevenueForRangeOrders(filters, range) {
  const orderMatch = buildOrderMatch(filters, range);
  const orders = await Donhang.find(orderMatch)
    .select('_id tongtien giamgia phivanchuyen tonggiamdoanhthu_hoantra tonggiamloinhuan_hoantra tongsoluong_hoantra')
    .lean();
  if (!orders || !orders.length) return 0;

  const orderIds = orders.map((order) => order._id);
  const { byOrder } = await buildReturnAdjustments(orderIds, {
    category: '',
    includeOrderFallback: true,
    orders
  });

  const orderItemRows = await Chitietdonhang.aggregate([
    { $match: { donhang_id: { $in: orderIds } } },
    {
      $group: {
        _id: '$donhang_id',
        grossItemRevenue: {
          $sum: {
            $ifNull: ['$thanhtien', { $multiply: ['$giaban', '$soluong'] }]
          }
        }
      }
    }
  ]);

  const grossRevenueMap = new Map();
  orderItemRows.forEach((row) => {
    const orderId = String(row?._id || '');
    if (!orderId) return;
    grossRevenueMap.set(orderId, Math.max(0, Number(row?.grossItemRevenue || 0)));
  });

  return orders.reduce((sum, order) => {
    return sum + getOrderNetRevenue(order, byOrder, { grossRevenueMap });
  }, 0);
}

async function sumManualExportRevenueForRange(filters, range) {
  const metrics = await buildManualExportMetrics(filters, range, 'month');
  return Number(metrics?.totalRevenue || 0);
}

// Lấy dữ liệu khởi tạo trang báo cáo (bộ lọc, danh mục, mốc thời gian).
async function getTrangBaoCaoData() {
  const categories = await Sanpham.distinct('loaisanpham', { daxoa: { $ne: true } });
  const cleanedCategories = (categories || []).filter((c) => c && String(c).trim() !== '');

  const statusOptions = STATUS_CHOICES.map((value) => ({
    value,
    label: nhantrangthai[value] || value
  }));

  const now = new Date();
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y -= 1) {
    years.push(y);
  }

  const months = Array.from({ length: 12 }, (_, idx) => {
    const value = idx + 1;
    return { value, label: `Tháng ${value}` };
  });

  return {
    titlePage: 'Báo cáo thống kê bán hàng',
    categories: cleanedCategories,
    statusOptions,
    defaultStatus: DEFAULT_STATUS,
    months,
    years
  };
}

// Tính và tổng hợp toàn bộ dữ liệu báo cáo theo bộ lọc query.
async function getDuLieuBaoCao(query = {}) {
  const status = normalizeStatus(query.status || DEFAULT_STATUS);
  const category = String(query.category || '').trim();
  const range = buildDateRange(query);
  const groupBy = resolveGroupBy(query.groupBy, range);

  const filters = {
    status,
    category: category || ''
  };

  const orderMatch = buildOrderMatch(filters, range);
  const orders = await Donhang.find(orderMatch)
    .select('_id madonhang ngaytao trangthai tennguoinhan tongtien giamgia phivanchuyen tonggiamdoanhthu_hoantra tonggiamloinhuan_hoantra tongsoluong_hoantra')
    .lean();
  await ganThongTinHoanHangChoDanhSachDon(orders);

  const orderMap = new Map();
  orders.forEach((order) => {
    orderMap.set(String(order._id), order);
  });

  const orderIds = orders.map((order) => order._id);
  const [costTimeline, returnAdjustments, manualExportMetrics] = await Promise.all([
    buildCostTimeline(),
    buildReturnAdjustments(orderIds, {
      category: filters.category,
      includeOrderFallback: true,
      orders
    }),
    buildManualExportMetrics(filters, range, groupBy)
  ]);
  const returnsByOrder = returnAdjustments.byOrder;
  const returnedQtyByProduct = returnAdjustments.returnedQtyByProduct;

  const productMap = new Map();
  const orderItemMetrics = new Map();
  const orderCostMap = new Map();
  const orderRevenueMap = new Map();
  const orderQtyMap = new Map();
  const revenueByBucket = new Map();
  const costByBucket = new Map();

  let totalCost = 0;
  let totalQty = 0;

  let items = [];
  if (orderIds.length) {
    items = await Chitietdonhang.aggregate([
      { $match: { donhang_id: { $in: orderIds } } },
      ...buildItemPipeline(filters, range)
    ]);
  }

  items.forEach((item) => {
    const order = orderMap.get(String(item.orderId));
    if (!order) return;

    const revenue = Number(item.itemRevenue || 0);
    const qty = Number(item.itemQty || 0);
    const fifoCost = calcFifoCostFromItem(item);

    let cost = fifoCost.costFromFifo;
    if (!fifoCost.hasFifo) {
      const unitCost = resolveCostAtDate(costTimeline, item, order.ngaytao);
      cost = unitCost * qty;
    } else if (fifoCost.qtyFromFifo < qty) {
      const unitCost = resolveCostAtDate(costTimeline, item, order.ngaytao);
      const missingQty = Math.max(0, qty - fifoCost.qtyFromFifo);
      cost += (unitCost * missingQty);
    }

    totalCost += cost;
    totalQty += qty;

    const orderId = String(item.orderId);
    const itemId = String(item.itemId || '').trim();
    if (itemId) {
      orderItemMetrics.set(itemId, {
        orderId,
        productId: String(item.productId || '').trim(),
        qty,
        revenue,
        cost
      });
    }
    orderCostMap.set(orderId, (orderCostMap.get(orderId) || 0) + cost);
    orderQtyMap.set(orderId, (orderQtyMap.get(orderId) || 0) + qty);
    orderRevenueMap.set(orderId, (orderRevenueMap.get(orderId) || 0) + revenue);

    const date = order.ngaytao ? new Date(order.ngaytao) : null;
    if (date) {
      const label = formatDateLabel(date, groupBy);
      if (filters.category) {
        revenueByBucket.set(label, (revenueByBucket.get(label) || 0) + revenue);
      }
      costByBucket.set(label, (costByBucket.get(label) || 0) + cost);
    }

    const productKey = String(item.productId || item.productName || 'unknown');
    if (!productMap.has(productKey)) {
      productMap.set(productKey, {
        id: String(item.productId || ''),
        name: item.productName || 'Sản phẩm',
        qty: 0
      });
    }
    productMap.get(productKey).qty += qty;
  });

  // Legacy fallback: older refunded/returned orders may miss export-return totals.
  // In that case, infer returned amounts from requestedItems and item snapshots.
  orders.forEach((order) => {
    const orderId = String(order?._id || '');
    if (!orderId || returnsByOrder.has(orderId)) return;
    if (!FINALIZED_RETURN_STATUSES.has(String(order?.trangthai || ''))) return;

    const requestedItems = Array.isArray(order?.yeucauhoanhang?.requestedItems)
      ? order.yeucauhoanhang.requestedItems
      : [];
    if (!requestedItems.length) return;

    let fallbackRevenue = 0;
    let fallbackCost = 0;
    let fallbackQty = 0;

    requestedItems.forEach((row) => {
      const orderItemId = String(row?.orderItemId || '').trim();
      if (!orderItemId) return;

      const metric = orderItemMetrics.get(orderItemId);
      if (!metric) return;

      const requestedQty = toPositiveNumber(row?.qty);
      if (requestedQty <= 0 || metric.qty <= 0) return;

      const qtyToSubtract = Math.min(metric.qty, requestedQty);
      const unitRevenue = metric.revenue / metric.qty;
      const unitCost = metric.cost / metric.qty;

      fallbackRevenue += (unitRevenue * qtyToSubtract);
      fallbackCost += (unitCost * qtyToSubtract);
      fallbackQty += qtyToSubtract;

      const productId = String(metric.productId || '').trim();
      if (productId) {
        returnedQtyByProduct.set(productId, (returnedQtyByProduct.get(productId) || 0) + qtyToSubtract);
      }
    });

    if (fallbackRevenue > 0 || fallbackCost > 0 || fallbackQty > 0) {
      returnsByOrder.set(orderId, {
        revenue: fallbackRevenue,
        cost: fallbackCost,
        qty: fallbackQty
      });
    }
  });

  const grossOrderRevenueMap = new Map(orderRevenueMap);

  returnedQtyByProduct.forEach((returnedQty, productId) => {
    const key = String(productId || '').trim();
    if (!key || !productMap.has(key)) return;

    const product = productMap.get(key);
    product.qty = Math.max(0, Number(product.qty || 0) - toPositiveNumber(returnedQty));
  });

  returnsByOrder.forEach((entry, orderId) => {
    const order = orderMap.get(orderId);
    if (!order) return;

    const returnedQty = toPositiveNumber(entry?.qty);
    const returnedCost = toPositiveNumber(entry?.cost);
    const returnedRevenue = toPositiveNumber(entry?.revenue);

    if (returnedQty > 0) {
      totalQty = Math.max(0, totalQty - returnedQty);
      orderQtyMap.set(orderId, Math.max(0, Number(orderQtyMap.get(orderId) || 0) - returnedQty));
    }

    if (returnedCost > 0) {
      totalCost = Math.max(0, totalCost - returnedCost);
      orderCostMap.set(orderId, Math.max(0, Number(orderCostMap.get(orderId) || 0) - returnedCost));
    }

    const date = order.ngaytao ? new Date(order.ngaytao) : null;
    if (date) {
      const label = formatDateLabel(date, groupBy);

      if (returnedCost > 0) {
        costByBucket.set(label, Math.max(0, Number(costByBucket.get(label) || 0) - returnedCost));
      }

      if (filters.category && returnedRevenue > 0) {
        revenueByBucket.set(label, Math.max(0, Number(revenueByBucket.get(label) || 0) - returnedRevenue));
      }
    }

    if (filters.category && returnedRevenue > 0) {
      const currentRevenue = Number(orderRevenueMap.get(orderId) || 0);
      orderRevenueMap.set(orderId, Math.max(0, currentRevenue - returnedRevenue));
    }
  });

  manualExportMetrics.productMap.forEach((manualProduct, key) => {
    const product = productMap.get(key) || {
      id: String(manualProduct?.id || ''),
      name: manualProduct?.name || 'Sản phẩm',
      qty: 0
    };
    product.qty += toPositiveNumber(manualProduct?.qty);
    productMap.set(key, product);
  });

  manualExportMetrics.revenueByBucket.forEach((value, label) => {
    revenueByBucket.set(label, (revenueByBucket.get(label) || 0) + Number(value || 0));
  });
  manualExportMetrics.costByBucket.forEach((value, label) => {
    costByBucket.set(label, (costByBucket.get(label) || 0) + Number(value || 0));
  });

  totalCost += Number(manualExportMetrics.totalCost || 0);
  totalQty += Number(manualExportMetrics.totalQty || 0);

  let totalRevenue = 0;
  if (filters.category) {
    orderRevenueMap.forEach((value) => {
      totalRevenue += value;
    });
  } else {
    orders.forEach((order) => {
      const netRevenue = getOrderNetRevenue(order, returnsByOrder, {
        grossRevenueMap: grossOrderRevenueMap
      });
      totalRevenue += netRevenue;
      const date = order.ngaytao ? new Date(order.ngaytao) : null;
      if (date) {
        const label = formatDateLabel(date, groupBy);
        revenueByBucket.set(label, (revenueByBucket.get(label) || 0) + netRevenue);
      }
    });
  }
  totalRevenue += Number(manualExportMetrics.totalRevenue || 0);

  const labels = buildTimeLabels(range.from, range.to, groupBy);
  const revenueSeries = labels.map((label) => Number(revenueByBucket.get(label) || 0));
  const costSeries = labels.map((label) => Number(costByBucket.get(label) || 0));
  const profitSeries = labels.map((_, idx) => revenueSeries[idx] - costSeries[idx]);

  let totalOrders = filters.category
    ? orderRevenueMap.size
    : orders.length;
  totalOrders += Number(manualExportMetrics.totalOrders || 0);

  const profit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const topProducts = Array.from(productMap.values())
    .filter((product) => Number(product.qty || 0) > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const allOrderRows = orders
    .filter((order) => {
      if (!filters.category) return true;
      return orderRevenueMap.has(String(order._id));
    })
    .map((order) => {
      const orderId = String(order._id);
      const revenue = filters.category
        ? Number(orderRevenueMap.get(orderId) || 0)
        : getOrderNetRevenue(order, returnsByOrder, {
          grossRevenueMap: grossOrderRevenueMap
        });
      const cost = Number(orderCostMap.get(orderId) || 0);
      const rowProfit = revenue - cost;
      return {
        id: orderId,
        orderCode: order.madonhang || orderId,
        orderDate: order.ngaytao,
        customerName: order.tennguoinhan || 'Khách lẻ',
        revenue,
        cost,
        profit: rowProfit,
        status: order.trangthai,
        statusLabel: nhantrangthai[order.trangthai] || order.trangthai,
        statusClass: buildStatusClass(order.trangthai),
        detailUrl: `/admin/orders/${orderId}`
      };
    });
  if (Array.isArray(manualExportMetrics.rows) && manualExportMetrics.rows.length) {
    allOrderRows.push(...manualExportMetrics.rows);
  }
  allOrderRows.sort((a, b) => new Date(b.orderDate || 0) - new Date(a.orderDate || 0));
  const orderRows = allOrderRows.slice(0, 12);

  const topCustomersMap = new Map();
  orders.forEach((order) => {
    const orderId = String(order._id);
    if (filters.category && !orderRevenueMap.has(orderId)) return;

    const key = order.tennguoinhan || 'Khách lẻ';
    if (!topCustomersMap.has(key)) {
      topCustomersMap.set(key, { name: key, revenue: 0, orders: 0 });
    }
    const entry = topCustomersMap.get(key);
    const revenue = filters.category
      ? Number(orderRevenueMap.get(orderId) || 0)
      : getOrderNetRevenue(order, returnsByOrder, {
        grossRevenueMap: grossOrderRevenueMap
      });
    entry.revenue += revenue;
    entry.orders += 1;
  });

  if (Number(manualExportMetrics.totalRevenue || 0) > 0 || Number(manualExportMetrics.totalOrders || 0) > 0) {
    const manualKey = 'Xuất kho nội bộ';
    const existing = topCustomersMap.get(manualKey) || { name: manualKey, revenue: 0, orders: 0 };
    existing.revenue += Number(manualExportMetrics.totalRevenue || 0);
    existing.orders += Number(manualExportMetrics.totalOrders || 0);
    topCustomersMap.set(manualKey, existing);
  }

  const mergedTopCustomers = Array.from(topCustomersMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const prevRange = buildPreviousRange(range);
  const prevOrderRevenue = prevRange
    ? (filters.category
      ? await sumRevenueForRangeItems(filters, prevRange)
      : await sumRevenueForRangeOrders(filters, prevRange))
    : 0;
  const prevManualRevenue = prevRange
    ? await sumManualExportRevenueForRange(filters, prevRange)
    : 0;
  const prevRevenue = prevOrderRevenue + prevManualRevenue;
  const growth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;

  return {
    success: true,
    filters: {
      status,
      category: filters.category,
      fromDate: range.from,
      toDate: range.to
    },
    overview: {
      totalRevenue,
      totalOrders,
      totalSold: totalQty,
      totalCost,
      profit,
      profitMargin,
      totalCapital: totalCost
    },
    charts: {
      revenueByMonth: {
        labels,
        data: revenueSeries
      },
      profitTrend: {
        labels,
        data: profitSeries
      },
      topProducts: {
        labels: topProducts.map((p) => p.name),
        data: topProducts.map((p) => p.qty)
      },
      revenueVsCost: {
        labels,
        revenue: revenueSeries,
        cost: costSeries
      }
    },
    table: {
      rows: orderRows,
      exportRows: allOrderRows
    },
    advanced: {
      topProducts,
      topCustomers: mergedTopCustomers,
      growth,
      negativeProfit: profit < 0,
      previousRevenue: prevRevenue
    }
  };
}

module.exports = {
  getTrangBaoCaoData,
  getDuLieuBaoCao
};
