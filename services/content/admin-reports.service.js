const Chitietdonhang = require('../../models/order_item_model');
const Donhang = require('../../models/order_model');
const Sanpham = require('../../models/product_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const { nhantrangthai, layTrangThaiChoPhep } = require('../../helpers/orderStatus');

const STATUS_CHOICES = layTrangThaiChoPhep();
const STATUS_SET = new Set(STATUS_CHOICES);
const DEFAULT_STATUS = 'dagiao';

function parseNumber(value, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) return null;
  if (max != null && n > max) return null;
  return n;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeStatus(raw) {
  const v = String(raw || '').trim();
  if (!v) return DEFAULT_STATUS;
  if (!STATUS_SET.has(v)) return DEFAULT_STATUS;
  return v;
}

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

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateLabel(date, groupBy) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  if (groupBy === 'day') return `${y}-${m}-${d}`;
  if (groupBy === 'year') return `${y}`;
  return `${y}-${m}`;
}

function resolveGroupBy(raw, range) {
  const value = String(raw || '').trim().toLowerCase();
  if (['day', 'month', 'year'].includes(value)) return value;

  const span = range.to.getTime() - range.from.getTime();
  const days = Math.ceil(span / (24 * 60 * 60 * 1000)) + 1;
  if (days <= 31) return 'day';
  if (days <= 370) return 'month';
  return 'year';
}

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
    case 'dahuy':
      return 'bg-danger';
    case 'hoanhang':
      return 'bg-secondary';
    default:
      return 'bg-secondary';
  }
}

function buildOrderMatch(filters, range) {
  const match = {
    daxoa: { $ne: true },
    $or: [{ trangthai: 'dagiao' }, { dathanhtoan: true }]
  };

  if (filters.status && filters.status !== 'all') {
    match.trangthai = filters.status;
  }

  if (range && range.from && range.to) {
    match.ngaytao = { $gte: range.from, $lte: range.to };
  }

  return match;
}

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

function buildItemPipeline(filters, range) {
  const orderMatch = buildOrderMatch(filters, range);

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
      orderId: '$donhang_id',
      itemQty: '$soluong',
      itemRevenue: 1,
      productName: { $ifNull: ['$tensanpham', '$product.tensanpham'] },
      productId: '$sanpham_id',
      variantId: '$bienthe_id',
      size: '$kichco'
    }
  });

  return pipeline;
}

async function sumRevenueForRangeItems(filters, range) {
  const rows = await Chitietdonhang.aggregate([
    ...buildItemPipeline(filters, range),
    {
      $group: {
        _id: null,
        total: { $sum: '$itemRevenue' }
      }
    }
  ]);
  if (!rows || !rows.length) return 0;
  return Number(rows[0].total || 0);
}

async function sumRevenueForRangeOrders(filters, range) {
  const orderMatch = buildOrderMatch(filters, range);
  const rows = await Donhang.aggregate([
    { $match: orderMatch },
    { $group: { _id: null, total: { $sum: '$tongtien' } } }
  ]);
  if (!rows || !rows.length) return 0;
  return Number(rows[0].total || 0);
}

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
    .select('_id madonhang ngaytao trangthai tennguoinhan tongtien')
    .lean();

  const orderMap = new Map();
  orders.forEach((order) => {
    orderMap.set(String(order._id), order);
  });

  const orderIds = orders.map((order) => order._id);
  const costTimeline = await buildCostTimeline();

  const productMap = new Map();
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
    const unitCost = resolveCostAtDate(costTimeline, item, order.ngaytao);
    const cost = unitCost * qty;

    totalCost += cost;
    totalQty += qty;

    const orderId = String(item.orderId);
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

  let totalRevenue = 0;
  if (filters.category) {
    orderRevenueMap.forEach((value) => {
      totalRevenue += value;
    });
  } else {
    orders.forEach((order) => {
      totalRevenue += Number(order.tongtien || 0);
      const date = order.ngaytao ? new Date(order.ngaytao) : null;
      if (date) {
        const label = formatDateLabel(date, groupBy);
        revenueByBucket.set(label, (revenueByBucket.get(label) || 0) + Number(order.tongtien || 0));
      }
    });
  }

  const labels = buildTimeLabels(range.from, range.to, groupBy);
  const revenueSeries = labels.map((label) => Number(revenueByBucket.get(label) || 0));
  const costSeries = labels.map((label) => Number(costByBucket.get(label) || 0));
  const profitSeries = labels.map((_, idx) => revenueSeries[idx] - costSeries[idx]);

  const totalOrders = filters.category
    ? orderRevenueMap.size
    : orders.length;

  const profit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const orderRows = orders
    .filter((order) => {
      if (!filters.category) return true;
      return orderRevenueMap.has(String(order._id));
    })
    .sort((a, b) => new Date(b.ngaytao) - new Date(a.ngaytao))
    .slice(0, 12)
    .map((order) => {
      const orderId = String(order._id);
      const revenue = filters.category
        ? Number(orderRevenueMap.get(orderId) || 0)
        : Number(order.tongtien || 0);
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
      : Number(order.tongtien || 0);
    entry.revenue += revenue;
    entry.orders += 1;
  });

  const topCustomers = Array.from(topCustomersMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const prevRange = buildPreviousRange(range);
  const prevRevenue = prevRange
    ? (filters.category
      ? await sumRevenueForRangeItems(filters, prevRange)
      : await sumRevenueForRangeOrders(filters, prevRange))
    : 0;
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
      rows: orderRows
    },
    advanced: {
      topProducts,
      topCustomers,
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
