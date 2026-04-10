const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const TonKhoLo = require('../../models/inventory_lot_model');
const paginationHelper = require('../../helpers/pagination');
const { thoatBieuThuc } = require('../../helpers/validators');
const { layTrangThaiChoPhep } = require('../../helpers/orderStatus');
const { laLoaiKhongSize, tinhTongTon } = require('../catalog/productStock.service.js');
const {
  danhDauThatBaiTatCaPendingTheoDonHang,
  capNhatGiaoDichThanhToan
} = require('../payment/payment.service.js');
const { taoHoanTienMoMo, taoThongTinYeuCauHoanTienMoMo } = require('../payment/momo.service.js');
const { restoreVoucherUsageForUser } = require('../payment/voucher.service.js');
const {
  sendOrderConfirmedEmail,
  sendOrderDeliveredEmail
} = require('../communication/orderEmail.service.js');
const { taoPhieuXuatTuDonHang } = require('../inventory/exportReceipt.service.js');
const {
  dongBoNhapKhoHoanTra
} = require('./order-return.service.js');
const {
  dongBoYeuCauHoanHangTuDon,
  ghiNhanLichSuTrangThaiDonHang,
  ganThongTinHoanHangChoDon,
  ganThongTinHoanHangChoDanhSachDon
} = require('./order-sidecar.service.js');

const TRANG_THAI_CHO_PHEP = layTrangThaiChoPhep().filter((s) => s !== 'all');
const TAP_TRANG_THAI = new Set(TRANG_THAI_CHO_PHEP);

const CHUYEN_TRANG_THAI = {
  choxacnhan: ['daxacnhan', 'dahuy'],
  daxacnhan: ['dangchuanbi', 'dahuy'],
  dangchuanbi: ['danggiao'],
  danggiao: ['dagiao'],
  dagiao: [],
  requested_return: ['approved_return', 'rejected_return'],
  approved_return: ['returned'],
  rejected_return: [],
  return_shipping: ['returned'],
  returned: ['refunded'],
  returned_full: ['refunded'],
  returned_partial: ['refunded'],
  refunded: [],
  dahuy: [],
  hoanhang: []
};

const ADMIN_STATUS_LABELS = {
  all: 'Tất cả',
  choxacnhan: 'Chờ xác nhận',
  daxacnhan: 'Đã xác nhận',
  dangchuanbi: 'Đang đóng gói',
  danggiao: 'Đang giao hàng',
  dagiao: 'Hoàn thành',
  requested_return: 'Yêu cầu hoàn hàng',
  approved_return: 'Đã duyệt hoàn hàng',
  rejected_return: 'Từ chối hoàn hàng',
  return_shipping: 'Đang gửi hàng hoàn',
  returned: 'Đã nhận hàng hoàn',
  returned_full: 'Đã trả hàng',
  returned_partial: 'Trả hàng một phần',
  refunded: 'Đã hoàn tiền',
  dahuy: 'Đã hủy',
  hoanhang: 'Hoàn trả'
};

const ORDER_FILTER_STATUS_OPTIONS = [
  'choxacnhan',
  'daxacnhan',
  'dangchuanbi',
  'danggiao',
  'dagiao',
  'requested_return',
  'approved_return',
  'rejected_return',
  'return_shipping',
  'returned',
  'refunded',
  'dahuy'
];

const ORDER_BULK_STATUS_OPTIONS = [
  'daxacnhan',
  'dangchuanbi',
  'danggiao',
  'dagiao',
  'approved_return',
  'rejected_return',
  'return_shipping',
  'returned',
  'refunded'
];

const ADMIN_FLOW = ['choxacnhan', 'daxacnhan', 'dangchuanbi', 'danggiao', 'dagiao', 'requested_return', 'approved_return', 'returned', 'refunded'];
const RETURN_STEP_STATUSES = new Set(['approved_return', 'rejected_return', 'return_shipping', 'returned', 'returned_full', 'returned_partial', 'refunded']);
const DEFAULT_ORDERS_LIST_URL = '/admin/orders';

async function dongBoSidecarAnToan(taskName, runner) {
  try {
    await runner();
  } catch (error) {
    console.error(`${taskName} error:`, error);
  }
}

function chuanHoaTuKhoa(raw) {
  const k = String(raw || '').trim();
  if (!k) return '';
  return thoatBieuThuc(k.slice(0, 100));
}

function chuanHoaPhuongThuc(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  return v;
}

function phanTichNgay(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function taoChuoiBoLoc({ keyword, status, payment, fromDate, toDate, sort, limit }) {
  let s = '';
  if (keyword) s += `&search=${encodeURIComponent(keyword)}`;
  if (status) s += `&status=${encodeURIComponent(status)}`;
  if (payment) s += `&paymentMethod=${encodeURIComponent(payment)}`;
  if (fromDate) s += `&fromDate=${encodeURIComponent(fromDate)}`;
  if (toDate) s += `&toDate=${encodeURIComponent(toDate)}`;
  if (sort) s += `&sort=${encodeURIComponent(sort)}`;
  if (limit) s += `&limit=${encodeURIComponent(limit)}`;
  return s;
}

function sortMap(sortKey) {
  switch (sortKey) {
    case 'oldest':
      return { ngaytao: 1, createdAt: 1, _id: 1 };
    case 'total-asc':
      return { tongtien: 1, tamtinh: 1 };
    case 'total-desc':
      return { tongtien: -1, tamtinh: -1 };
    case 'newest':
    default:
      return { ngaytao: -1, createdAt: -1, _id: -1 };
  }
}

function layDuongDanDanhSachHopLe(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';

  let path = '';
  try {
    const parsed = new URL(input, 'http://localhost');
    path = `${parsed.pathname || ''}${parsed.search || ''}`;
  } catch {
    return '';
  }

  if (!path.startsWith('/admin/orders')) return '';
  if (/^\/admin\/orders\/[^/?#]+/.test(path)) return '';
  return path;
}

function layDuongDanDanhSachMacDinh() {
  return DEFAULT_ORDERS_LIST_URL;
}

function layDuongDanQuayLaiDanhSach({ fromBody, fromQuery } = {}) {
  return layDuongDanDanhSachHopLe(fromBody)
    || layDuongDanDanhSachHopLe(fromQuery)
    || layDuongDanDanhSachMacDinh();
}

function taoDuongDanChiTietDon({ id, returnTo } = {}) {
  const safeId = encodeURIComponent(String(id || '').trim());
  const safeReturnTo = layDuongDanDanhSachHopLe(returnTo) || layDuongDanDanhSachMacDinh();
  return `/admin/orders/${safeId}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

function taoTenFileXuatDonHang(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `don-hang-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;
}

function xacDinhLoaiFlashKetQua(result, options = {}) {
  const { warningCodes = [], warningWhenPartial = false } = options || {};
  if (!result || !result.ok) {
    if (result && result.code && warningCodes.includes(result.code)) return 'warning';
    return 'error';
  }
  if (warningWhenPartial && result.isPartial) return 'warning';
  return 'success';
}

function buildBadgeClass(status) {
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
      return 'bg-secondary';
    case 'returned_full':
      return 'bg-success';
    case 'returned_partial':
      return 'bg-warning text-dark';
    case 'refunded':
      return 'bg-dark';
    case 'dahuy':
      return 'bg-danger';
    case 'hoanhang':
      return 'bg-secondary';
    default:
      return 'bg-secondary';
  }
}

function layNhanTrangThai(status) {
  return ADMIN_STATUS_LABELS[status] || status || '-';
}

function taoBoLocTuQuery(query = {}) {
  const keyword = chuanHoaTuKhoa(query.search);
  const statusRaw = String(query.status || 'all').trim();
  const status = ['returned_full', 'returned_partial', 'hoanhang'].includes(statusRaw)
    ? 'returned'
    : ((statusRaw && TAP_TRANG_THAI.has(statusRaw)) ? statusRaw : 'all');
  const paymentMethod = chuanHoaPhuongThuc(query.paymentMethod);
  const fromDate = phanTichNgay(query.fromDate);
  const toDate = phanTichNgay(query.toDate);
  const sort = String(query.sort || 'newest');

  const limitRaw = parseInt(query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(10, limitRaw)) : 10;

  const boloc = { daxoa: { $ne: true } };

  if (status !== 'all') {
    if (status === 'returned') {
      boloc.trangthai = { $in: ['returned', 'returned_full', 'returned_partial', 'hoanhang'] };
    } else {
      boloc.trangthai = status;
    }
  }
  if (paymentMethod) boloc.phuongthucthanhtoan = paymentMethod;

  if (keyword) {
    boloc.$or = [
      { madonhang: { $regex: keyword, $options: 'i' } },
      { tennguoinhan: { $regex: keyword, $options: 'i' } },
      { sodienthoai: { $regex: keyword, $options: 'i' } },
      { email: { $regex: keyword, $options: 'i' } }
    ];
  }

  if (fromDate || toDate) {
    const range = {};
    if (fromDate) {
      fromDate.setHours(0, 0, 0, 0);
      range.$gte = fromDate;
    }
    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
      range.$lte = toDate;
    }
    boloc.ngaytao = range;
  }

  return {
    boloc,
    keyword,
    status,
    paymentMethod,
    fromDate: query.fromDate || '',
    toDate: query.toDate || '',
    sort,
    limit
  };
}

function taoMaPhieuNhapHoanTra() {
  return `NK-RETURN-${Date.now()}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function normalizeReturnItemsPayload(raw) {
  if (!raw) return [];

  let rows = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (typeof raw === 'object') {
    rows = Object.keys(raw)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => raw[key]);
  } else {
    return [];
  }

  return rows
    .map((it) => ({
      orderItemId: String(it?.orderItemId || it?._id || '').trim(),
      qty: toPositiveInt(it?.qty, 0)
    }))
    .filter((it) => mongoose.Types.ObjectId.isValid(it.orderItemId) && it.qty >= 0);
}

function buildExportLineKey({ sanphamid, bientheid, kichco }) {
  const productId = String(sanphamid || '').trim();
  const variantId = bientheid ? String(bientheid).trim() : 'main';
  const sizeKey = String(kichco || '').trim();
  return `${productId}|${variantId}|${sizeKey}`;
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0));
}

function splitAmountByQty(totalAmount, totalQty, partQty) {
  const amount = Math.max(0, roundMoney(totalAmount));
  const qty = Math.max(0, toPositiveInt(totalQty, 0));
  const part = Math.max(0, toPositiveInt(partQty, 0));
  if (amount <= 0 || qty <= 0 || part <= 0) return 0;
  if (part >= qty) return amount;
  return Math.max(0, Math.min(amount, Math.round((amount * part) / qty)));
}

function allocateProportionalAmounts(rows, totalAmount) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({
      id: String(row && row.id ? row.id : '').trim(),
      weight: Math.max(0, roundMoney(row && row.amount ? row.amount : 0)),
      index
    }))
    .filter((row) => row.id);

  const result = {};
  for (const row of normalizedRows) result[row.id] = 0;

  const target = Math.max(0, roundMoney(totalAmount));
  if (!normalizedRows.length || target <= 0) return result;

  const totalWeight = normalizedRows.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return result;

  const allocations = normalizedRows.map((row) => {
    const exact = (target * row.weight) / totalWeight;
    const floorVal = Math.floor(exact);
    return {
      ...row,
      value: floorVal,
      fraction: exact - floorVal
    };
  });

  let assigned = allocations.reduce((sum, row) => sum + row.value, 0);
  let remain = target - assigned;

  allocations.sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.index - b.index;
  });

  let cursor = 0;
  while (remain > 0 && allocations.length) {
    allocations[cursor % allocations.length].value += 1;
    remain -= 1;
    cursor += 1;
  }

  for (const row of allocations) result[row.id] = row.value;
  return result;
}

function buildOrderItemExportKey(item = {}) {
  const productId = String(item?.sanpham_id || item?.sanphamid || '').trim();
  if (!productId) return '';
  return buildExportLineKey({
    sanphamid: productId,
    bientheid: item?.bienthe_id || item?.bientheid || null,
    kichco: item?.kichco || ''
  });
}

function buildReturnedItemSummary({ exportReceipt, orderItems = [] } = {}) {
  const out = {
    items: [],
    returnedQtyByItemId: {},
    totalReturnedQty: 0,
    totalRefundAmount: 0
  };

  const lines = Array.isArray(exportReceipt?.chitiet) ? exportReceipt.chitiet : [];
  if (!lines.length) return out;

  const orderItemsByKey = new Map();
  for (const it of (Array.isArray(orderItems) ? orderItems : [])) {
    const key = buildOrderItemExportKey(it);
    if (!key) continue;
    const arr = orderItemsByKey.get(key) || [];
    arr.push(it);
    orderItemsByKey.set(key, arr);
  }

  const returnedByKey = new Map();
  for (const line of lines) {
    const productId = String(line?.sanphamid || '').trim();
    if (!productId) continue;
    const key = buildExportLineKey({
      sanphamid: productId,
      bientheid: line?.bientheid,
      kichco: line?.kichco
    });
    if (!key) continue;

    const allocs = Array.isArray(line?.allocations) ? line.allocations : [];
    const allocReturned = allocs.filter((a) => toPositiveInt(a?.soluonghoan, 0) > 0);
    const qtyFromAlloc = allocReturned.reduce((sum, a) => sum + toPositiveInt(a?.soluonghoan, 0), 0);
    const qtyFromLine = toPositiveInt(line?.soluonghoan, 0);
    const returnedQty = Math.max(qtyFromAlloc, qtyFromLine);
    if (returnedQty <= 0) continue;

    let row = returnedByKey.get(key);
    if (!row) {
      row = {
        key,
        tensanpham: String(line?.tensanpham || '').trim(),
        hinhanh: String(line?.hinhanh || '').trim(),
        kichco: String(line?.kichco || '').trim(),
        mausac: String(line?.mausac || '').trim(),
        returnedQty: 0,
        refundAmount: 0,
        priceBreakdown: []
      };
      returnedByKey.set(key, row);
    }

    const soldQty = Math.max(1, toPositiveInt(line?.soluong, 0) || 1);
    const unitByRevenue = toNumber(line?.doanhthu, 0) > 0
      ? (toNumber(line?.doanhthu, 0) / soldQty)
      : 0;
    const unitFallback = unitByRevenue > 0
      ? unitByRevenue
      : Math.max(0, toNumber(line?.giasaugiam, 0) || toNumber(line?.giaban, 0) || 0);

    if (allocReturned.length) {
      for (const alloc of allocReturned) {
        const qtyAllocReturned = toPositiveInt(alloc?.soluonghoan, 0);
        if (qtyAllocReturned <= 0) continue;

        const allocSoldQty = Math.max(1, toPositiveInt(alloc?.soLuong, 0) || 1);
        const allocUnitByRevenue = toNumber(alloc?.doanhthu, 0) > 0
          ? (toNumber(alloc?.doanhthu, 0) / allocSoldQty)
          : 0;
        const allocFallback = toNumber(alloc?.giasaugiam, 0)
          || toNumber(alloc?.giaban, 0)
          || toNumber(alloc?.giaBanDeXuat, 0)
          || unitFallback;
        const unitPrice = allocUnitByRevenue > 0 ? allocUnitByRevenue : Math.max(0, allocFallback);
        const amount = roundMoney(unitPrice * qtyAllocReturned);

        row.returnedQty += qtyAllocReturned;
        row.refundAmount += amount;
        row.priceBreakdown.push({
          qty: qtyAllocReturned,
          unitPrice,
          amount
        });
      }
      continue;
    }

    const amountFromLine = toNumber(line?.doanhthuhoan, 0);
    const amount = amountFromLine > 0 ? roundMoney(amountFromLine) : roundMoney(unitFallback * returnedQty);
    row.returnedQty += returnedQty;
    row.refundAmount += amount;
    row.priceBreakdown.push({
      qty: returnedQty,
      unitPrice: unitFallback,
      amount
    });
  }

  const rows = Array.from(returnedByKey.values());
  for (const row of rows) {
    const orderRefs = orderItemsByKey.get(row.key) || [];
    if (orderRefs.length) {
      const firstRef = orderRefs[0];
      if (!row.tensanpham) row.tensanpham = String(firstRef?.tensanpham || '').trim();
      if (!row.hinhanh) row.hinhanh = String(firstRef?.hinhanh || '').trim();
      if (!row.kichco) row.kichco = String(firstRef?.kichco || '').trim();
      if (!row.mausac) row.mausac = String(firstRef?.mausac || '').trim();
    }

    const grouped = new Map();
    for (const part of (Array.isArray(row.priceBreakdown) ? row.priceBreakdown : [])) {
      const unitPrice = roundMoney(part?.unitPrice || 0);
      const qty = toPositiveInt(part?.qty, 0);
      const amount = roundMoney(part?.amount || 0);
      if (qty <= 0) continue;
      if (!grouped.has(unitPrice)) {
        grouped.set(unitPrice, { qty: 0, unitPrice, amount: 0 });
      }
      const current = grouped.get(unitPrice);
      current.qty += qty;
      current.amount += amount;
    }

    row.priceBreakdown = Array.from(grouped.values())
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
    row.returnedQty = Math.max(
      toPositiveInt(row.returnedQty, 0),
      row.priceBreakdown.reduce((sum, p) => sum + toPositiveInt(p?.qty, 0), 0)
    );
    row.refundAmount = Math.max(
      roundMoney(row.refundAmount || 0),
      row.priceBreakdown.reduce((sum, p) => sum + roundMoney(p?.amount || 0), 0)
    );
  }

  const returnedQtyByItemId = {};
  for (const row of rows) {
    const refs = orderItemsByKey.get(row.key) || [];
    const preAssignedQty = refs.reduce((sum, ref) => {
      const itemId = String(ref?._id || '').trim();
      if (!itemId) return sum;
      return sum + Math.max(0, toPositiveInt(returnedQtyByItemId[itemId], 0));
    }, 0);

    let remaining = Math.max(0, toPositiveInt(row?.returnedQty, 0) - preAssignedQty);
    if (remaining <= 0) continue;

    for (const ref of refs) {
      if (remaining <= 0) break;
      const itemId = String(ref?._id || '').trim();
      if (!itemId) continue;

      const boughtQty = Math.max(0, toPositiveInt(ref?.soluong, 0));
      const assignedQty = Math.max(0, toPositiveInt(returnedQtyByItemId[itemId], 0));
      const availableQty = Math.max(0, boughtQty - assignedQty);
      if (availableQty <= 0) continue;

      const take = Math.min(availableQty, remaining);
      if (take <= 0) continue;

      returnedQtyByItemId[itemId] = assignedQty + take;
      remaining -= take;
    }
  }

  let totalRefundAmount = rows.reduce((sum, row) => sum + roundMoney(row?.refundAmount || 0), 0);
  if (totalRefundAmount <= 0) {
    totalRefundAmount = Math.max(0, roundMoney(exportReceipt?.tongdoanhthuhoan || 0));
  }

  out.items = rows;
  out.returnedQtyByItemId = returnedQtyByItemId;
  out.totalReturnedQty = rows.reduce((sum, row) => sum + toPositiveInt(row?.returnedQty, 0), 0);
  out.totalRefundAmount = totalRefundAmount;
  return out;
}

function buildReturnedItemSummaryFromImportReceipt({ importReceipt, orderItems = [] } = {}) {
  const out = {
    items: [],
    returnedQtyByItemId: {},
    totalReturnedQty: 0,
    totalRefundAmount: 0
  };

  const lines = Array.isArray(importReceipt?.chitiet) ? importReceipt.chitiet : [];
  if (!lines.length) return out;

  const orderItemsByKey = new Map();
  for (const it of (Array.isArray(orderItems) ? orderItems : [])) {
    const key = buildOrderItemExportKey(it);
    if (!key) continue;
    const arr = orderItemsByKey.get(key) || [];
    arr.push(it);
    orderItemsByKey.set(key, arr);
  }

  const returnedByKey = new Map();
  const returnedQtyByItemId = {};
  for (const line of lines) {
    const productId = String(line?.sanphamid || line?.sanpham_id || '').trim();
    const qty = toPositiveInt(line?.soluong, 0);
    if (!productId || qty <= 0) continue;

    const key = buildExportLineKey({
      sanphamid: productId,
      bientheid: line?.bientheid || line?.bienthe_id,
      kichco: line?.kichco || line?.kich_co
    });
    if (!key) continue;

    let row = returnedByKey.get(key);
    if (!row) {
      row = {
        key,
        tensanpham: String(line?.tensanpham || '').trim(),
        hinhanh: String(line?.hinhanh || '').trim(),
        kichco: String(line?.kichco || line?.kich_co || '').trim(),
        mausac: String(line?.mausac || line?.mau_sac || '').trim(),
        returnedQty: 0,
        refundAmount: 0,
        priceBreakdown: []
      };
      returnedByKey.set(key, row);
    }

    const unitPrice = Math.max(0, roundMoney(line?.giabandexuat || line?.gia_ban_de_xuat || 0));
    const amount = roundMoney(unitPrice * qty);
    row.returnedQty += qty;
    row.refundAmount += amount;
    row.priceBreakdown.push({
      qty,
      unitPrice,
      amount
    });

    const directOrderItemId = String(line?.orderitemid || line?.orderItemId || line?.order_item_id || '').trim();
    if (mongoose.Types.ObjectId.isValid(directOrderItemId)) {
      returnedQtyByItemId[directOrderItemId] = Math.max(0, toPositiveInt(returnedQtyByItemId[directOrderItemId], 0)) + qty;
    }
  }

  const rows = Array.from(returnedByKey.values());
  for (const row of rows) {
    const orderRefs = orderItemsByKey.get(row.key) || [];
    if (orderRefs.length) {
      const firstRef = orderRefs[0];
      if (!row.tensanpham) row.tensanpham = String(firstRef?.tensanpham || '').trim();
      if (!row.hinhanh) row.hinhanh = String(firstRef?.hinhanh || '').trim();
      if (!row.kichco) row.kichco = String(firstRef?.kichco || '').trim();
      if (!row.mausac) row.mausac = String(firstRef?.mausac || '').trim();
    }

    const grouped = new Map();
    for (const part of (Array.isArray(row.priceBreakdown) ? row.priceBreakdown : [])) {
      const unitPrice = roundMoney(part?.unitPrice || 0);
      const qty = toPositiveInt(part?.qty, 0);
      const amount = roundMoney(part?.amount || 0);
      if (qty <= 0) continue;
      if (!grouped.has(unitPrice)) {
        grouped.set(unitPrice, { qty: 0, unitPrice, amount: 0 });
      }
      const current = grouped.get(unitPrice);
      current.qty += qty;
      current.amount += amount;
    }

    row.priceBreakdown = Array.from(grouped.values())
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
    row.returnedQty = Math.max(
      toPositiveInt(row.returnedQty, 0),
      row.priceBreakdown.reduce((sum, p) => sum + toPositiveInt(p?.qty, 0), 0)
    );
    row.refundAmount = Math.max(
      roundMoney(row.refundAmount || 0),
      row.priceBreakdown.reduce((sum, p) => sum + roundMoney(p?.amount || 0), 0)
    );
  }

  for (const row of rows) {
    const refs = orderItemsByKey.get(row.key) || [];
    const preAssignedQty = refs.reduce((sum, ref) => {
      const itemId = String(ref?._id || '').trim();
      if (!itemId) return sum;
      return sum + Math.max(0, toPositiveInt(returnedQtyByItemId[itemId], 0));
    }, 0);

    let remaining = Math.max(0, toPositiveInt(row?.returnedQty, 0) - preAssignedQty);
    if (remaining <= 0) continue;

    for (const ref of refs) {
      if (remaining <= 0) break;
      const itemId = String(ref?._id || '').trim();
      if (!itemId) continue;

      const boughtQty = Math.max(0, toPositiveInt(ref?.soluong, 0));
      const assignedQty = Math.max(0, toPositiveInt(returnedQtyByItemId[itemId], 0));
      const availableQty = Math.max(0, boughtQty - assignedQty);
      if (availableQty <= 0) continue;

      const take = Math.min(availableQty, remaining);
      if (take <= 0) continue;

      returnedQtyByItemId[itemId] = assignedQty + take;
      remaining -= take;
    }
  }

  out.items = rows;
  out.returnedQtyByItemId = returnedQtyByItemId;
  out.totalReturnedQty = rows.reduce((sum, row) => sum + toPositiveInt(row?.returnedQty, 0), 0);
  out.totalRefundAmount = rows.reduce((sum, row) => sum + roundMoney(row?.refundAmount || 0), 0);
  return out;
}

function buildAdminRefundFinancialSummary({
  order = {},
  items = [],
  returnRequestItems = [],
  returnedQtyByItemId = {},
  returnActualTotalAmount = 0,
  statusLabels = ADMIN_STATUS_LABELS
} = {}) {
  const itemRows = Array.isArray(items) ? items : [];
  const requestRows = Array.isArray(returnRequestItems) ? returnRequestItems : [];
  const currentStatus = String(order?.trangthai || '').trim();

  const requestedQtyByItemId = {};
  for (const row of requestRows) {
    const itemId = String(row && row.orderItemId ? row.orderItemId : '').trim();
    const qty = Math.max(0, toPositiveInt(row && row.qty, 0));
    if (!itemId || qty <= 0) continue;
    requestedQtyByItemId[itemId] = (requestedQtyByItemId[itemId] || 0) + qty;
  }

  const lines = itemRows.map((raw, index) => {
    const id = String(raw && raw._id ? raw._id : `item-${index}`).trim();
    const boughtQty = Math.max(0, toPositiveInt(raw?.tongSoLuong || raw?.soluong, 0));
    const grossByStored = toNumber(raw?.tongThanhTien || raw?.thanhtien, 0);
    const unitFallback = toNumber(raw?.giaban, 0) > 0
      ? toNumber(raw?.giaban, 0)
      : toNumber(raw?.giagoc, 0);
    const grossAmount = Math.max(0, roundMoney(grossByStored > 0 ? grossByStored : (unitFallback * boughtQty)));
    return { id, raw, boughtQty, grossAmount };
  });

  const goodsSubtotal = Math.max(0, lines.reduce((sum, row) => sum + row.grossAmount, 0));
  const voucherRaw = toNumber(order?.voucher_discount, NaN);
  const voucherDiscount = Math.min(
    goodsSubtotal,
    Math.max(0, roundMoney(Number.isFinite(voucherRaw) ? voucherRaw : toNumber(order?.giamgia, 0)))
  );
  const shippingFee = Math.max(0, roundMoney(order?.phivanchuyen));
  const originalPayable = Math.max(0, goodsSubtotal - voucherDiscount + shippingFee);

  const voucherByItem = allocateProportionalAmounts(
    lines.map((line) => ({ id: line.id, amount: line.grossAmount })),
    voucherDiscount
  );

  const actualReturnedQtyTotal = lines.reduce((sum, line) => {
    const actual = Math.max(0, toPositiveInt(returnedQtyByItemId[line.id], 0));
    return sum + Math.min(actual, line.boughtQty);
  }, 0);

  const hasActualReturned = actualReturnedQtyTotal > 0
    || roundMoney(returnActualTotalAmount) > 0
    || roundMoney(order?.tonggiamdoanhthu_hoantra) > 0;
  const useRequestedMode = !hasActualReturned
    && new Set(['requested_return', 'approved_return', 'return_shipping']).has(currentStatus);

  const rows = lines.map((line) => {
    const requestedQty = Math.min(
      line.boughtQty,
      Math.max(0, toPositiveInt(requestedQtyByItemId[line.id], 0))
    );
    const actualQty = Math.min(
      line.boughtQty,
      Math.max(0, toPositiveInt(returnedQtyByItemId[line.id], 0))
    );
    const returnedQty = hasActualReturned ? actualQty : (useRequestedMode ? requestedQty : actualQty);
    const keptQty = Math.max(0, line.boughtQty - returnedQty);

    const allocatedVoucher = Math.max(0, roundMoney(voucherByItem[line.id] || 0));
    const lineAfterVoucher = Math.max(0, line.grossAmount - allocatedVoucher);
    const returnedVoucher = splitAmountByQty(allocatedVoucher, line.boughtQty, returnedQty);
    const keptVoucher = Math.max(0, allocatedVoucher - returnedVoucher);

    return {
      ...line,
      requestedQty,
      actualQty,
      returnedQty,
      keptQty,
      allocatedVoucher,
      lineAfterVoucher,
      provisionalRefunded: splitAmountByQty(lineAfterVoucher, line.boughtQty, returnedQty),
      keptAmount: 0,
      refundedAmount: 0,
      keptGrossAmount: splitAmountByQty(line.grossAmount, line.boughtQty, keptQty),
      keptVoucher
    };
  });

  const returnedRows = rows.filter((line) => line.returnedQty > 0);
  const provisionalTotal = returnedRows.reduce((sum, row) => sum + roundMoney(row.provisionalRefunded), 0);
  const actualTotal = Math.max(
    0,
    roundMoney(returnActualTotalAmount || order?.tonggiamdoanhthu_hoantra || 0)
  );
  // If we have actual returned quantities, refund must be computed from voucher-aware qty split.
  // Use stored total only as fallback when quantity details are missing.
  let refundTarget = provisionalTotal;
  if (refundTarget <= 0 && actualTotal > 0) {
    refundTarget = actualTotal;
  } else if (actualReturnedQtyTotal <= 0 && actualTotal > 0) {
    refundTarget = actualTotal;
  }
  refundTarget = Math.min(Math.max(0, refundTarget), originalPayable);

  const refundedByItem = refundTarget > 0
    ? allocateProportionalAmounts(
      returnedRows.map((row) => ({
        id: row.id,
        amount: roundMoney(row.provisionalRefunded || splitAmountByQty(row.lineAfterVoucher, row.boughtQty, row.returnedQty))
      })),
      refundTarget
    )
    : {};

  for (const row of rows) {
    row.refundedAmount = Math.max(0, roundMoney(refundedByItem[row.id] || 0));
    row.keptAmount = Math.max(0, roundMoney(row.lineAfterVoucher - row.refundedAmount));
  }

  const refundedAmount = Math.max(0, rows.reduce((sum, row) => sum + roundMoney(row.refundedAmount), 0));
  const remainingPayable = Math.max(0, originalPayable - refundedAmount);
  const keptGoodsValue = Math.max(0, rows.reduce((sum, row) => sum + roundMoney(row.keptGrossAmount), 0));
  const keptVoucherTotal = Math.max(0, rows.reduce((sum, row) => sum + roundMoney(row.keptVoucher), 0));
  const keptGoodsAfterVoucher = Math.max(
    0,
    Math.min(
      rows.reduce((sum, row) => sum + roundMoney(row.keptAmount), 0),
      Math.max(0, remainingPayable - shippingFee)
    )
  );

  return {
    requestedQtyByItemId,
    original: {
      goodsSubtotal,
      voucherDiscount,
      shippingFee,
      payable: originalPayable
    },
    refund: {
      mode: hasActualReturned ? 'actual' : (useRequestedMode ? 'requested' : 'none'),
      statusLabel: statusLabels[currentStatus] || currentStatus || '-',
      totalReturnedQty: rows.reduce((sum, row) => sum + Math.max(0, toPositiveInt(row.returnedQty, 0)), 0),
      amount: refundedAmount,
      items: rows
        .filter((row) => row.returnedQty > 0)
        .map((row) => ({
          itemId: row.id,
          name: String(row.raw?.tensanpham || 'San pham'),
          color: String(row.raw?.mausac || ''),
          size: String(row.raw?.kichco || ''),
          returnedQty: row.returnedQty,
          boughtQty: row.boughtQty,
          amount: row.refundedAmount
        }))
    },
    remaining: {
      keptQtyTotal: rows.reduce((sum, row) => sum + Math.max(0, toPositiveInt(row.keptQty, 0)), 0),
      goodsValue: keptGoodsValue,
      voucherAllocated: keptVoucherTotal,
      goodsAfterVoucher: keptGoodsAfterVoucher,
      payable: remainingPayable,
      items: rows
        .filter((row) => row.keptQty > 0)
        .map((row) => ({
          itemId: row.id,
          name: String(row.raw?.tensanpham || 'San pham'),
          color: String(row.raw?.mausac || ''),
          size: String(row.raw?.kichco || ''),
          keptQty: row.keptQty,
          boughtQty: row.boughtQty,
          amount: row.keptAmount
        }))
    }
  };
}

async function tinhSoTienHoanTheoYeuCau(order) {
  if (!order || !order._id) return 0;

  const requestedRows = normalizeReturnItemsPayload(
    order?.yeucauhoanhang?.requestedItems || order?.yeucauhoanhang?.returnItems
  );
  const orderItems = await Chitietdonhang.find({ donhang_id: order._id })
    .select('_id soluong thanhtien giaban giagoc tensanpham hinhanh kichco mausac sanpham_id bienthe_id')
    .lean();
  if (!orderItems.length) return 0;

  const requestedQtyByItemId = {};
  for (const row of requestedRows) {
    const itemId = String(row?.orderItemId || '').trim();
    const qty = Math.max(0, toPositiveInt(row?.qty, 0));
    if (!itemId || qty <= 0) continue;
    requestedQtyByItemId[itemId] = (requestedQtyByItemId[itemId] || 0) + qty;
  }

  const itemsForCalc = orderItems.map((it) => ({
    ...it,
    tongSoLuong: Math.max(0, toPositiveInt(it?.soluong, 0)),
    tongThanhTien: Math.max(
      0,
      roundMoney(
        toNumber(it?.thanhtien, 0) > 0
          ? toNumber(it?.thanhtien, 0)
          : (toNumber(it?.giaban, 0) > 0 ? toNumber(it?.giaban, 0) : toNumber(it?.giagoc, 0)) * toPositiveInt(it?.soluong, 0)
      )
    )
  }));

  const returnRequestItems = Object.keys(requestedQtyByItemId).map((itemId) => {
    const item = orderItems.find((it) => String(it?._id || '').trim() === itemId);
    return {
      orderItemId: itemId,
      qty: Math.max(0, toPositiveInt(requestedQtyByItemId[itemId], 0)),
      boughtQty: Math.max(0, toPositiveInt(item?.soluong, 0)),
      tensanpham: String(item?.tensanpham || '').trim(),
      hinhanh: String(item?.hinhanh || '').trim(),
      kichco: String(item?.kichco || '').trim(),
      mausac: String(item?.mausac || '').trim()
    };
  }).filter((row) => row.qty > 0);

  // Try to use actual returned quantities first (from export return data), then fallback to requested quantities.
  let returnedQtyByItemId = {};
  let returnActualTotalAmount = 0;
  const exportReceipt = await PhieuXuatKho.findOne({ donhang_id: order._id }).select('chitiet tongdoanhthuhoan').lean();
  if (exportReceipt) {
    const actualSummary = buildReturnedItemSummary({
      exportReceipt,
      orderItems
    });
    returnedQtyByItemId = actualSummary?.returnedQtyByItemId || {};
    returnActualTotalAmount = Math.max(
      0,
      roundMoney(actualSummary?.totalRefundAmount || exportReceipt?.tongdoanhthuhoan || 0)
    );
  }

  const financialSummary = buildAdminRefundFinancialSummary({
    order,
    items: itemsForCalc,
    returnRequestItems,
    returnedQtyByItemId,
    returnActualTotalAmount,
    statusLabels: ADMIN_STATUS_LABELS
  });

  return Math.max(0, roundMoney(financialSummary?.refund?.amount || 0));
}

function tinhTySuatLoiNhuan({ doanhThu, loiNhuan }) {
  const dt = toNumber(doanhThu, 0);
  const ln = toNumber(loiNhuan, 0);
  if (dt <= 0) return 0;
  return Number(((ln / dt) * 100).toFixed(2));
}

async function congTonChoChiTietDon(orderitemdoc) {
  const productid = orderitemdoc.sanpham_id;
  const variantid = orderitemdoc.bienthe_id;
  const size = orderitemdoc.kichco;
  const qty = Math.max(1, parseInt(orderitemdoc.soluong, 10) || 1);

  const product = await Sanpham.findById(productid);
  if (!product) throw new Error('Sản phẩm không tồn tại');

  const basetotal = (typeof product.soluongton === 'number') ? product.soluongton : tinhTongTon(product);
  const hassize = !laLoaiKhongSize(product.loaisanpham);

  if (!variantid) {
    if (hassize) {
      product.sizes = product.sizes || [];
      let row = (product.sizes || []).find(s => s.size === size);
      if (!row) {
        product.sizes.push({ size, soluong: qty });
      } else {
        row.soluong = Number(row.soluong || 0) + qty;
      }
    } else {
      product.soluong_chinh = Number(product.soluong_chinh || 0) + qty;
    }

    product.soluongton = basetotal + qty;
    await product.save();
    return;
  }

  const v = (product.bienthe || []).id(variantid);
  if (!v) throw new Error('Biến thể không tồn tại');

  if (hassize) {
    v.sizes = v.sizes || [];
    let row = (v.sizes || []).find(s => s.size === size);
    if (!row) {
      v.sizes.push({ size, soluong: qty });
    } else {
      row.soluong = Number(row.soluong || 0) + qty;
    }
  } else {
    v.soluong = Number(v.soluong || 0) + qty;
  }

  product.soluongton = basetotal + qty;
  await product.save();
}

function congTonChoDongTraHang(productDoc, { variantId, size, qty, mausac }) {
  const soLuong = Math.max(1, toPositiveInt(qty, 1));
  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);

  if (!variantId) {
    if (hasSize) {
      const sizeKey = String(size || '').trim();
      if (!sizeKey) throw new Error('Thiếu size cho sản phẩm có size');
      productDoc.sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const row = productDoc.sizes.find((s) => String(s.size || '') === sizeKey);
      if (row) row.soluong = Number(row.soluong || 0) + soLuong;
      else productDoc.sizes.push({ size: sizeKey, soluong: soLuong });
    } else {
      productDoc.soluong_chinh = Number(productDoc.soluong_chinh || 0) + soLuong;
    }
    return;
  }

  productDoc.bienthe = Array.isArray(productDoc.bienthe) ? productDoc.bienthe : [];
  let variant = productDoc.bienthe.find((v) => String(v._id) === String(variantId));
  if (!variant) {
    const seed = {
      mausac: String(mausac || 'Mặc định').trim() || 'Mặc định',
      hinhanh: String(productDoc.hinhanh || ''),
      gia: Number(productDoc.gia || 0),
      phantramgiamgia: Number(productDoc.phantramgiamgia || 0),
      soluong: 0,
      sizes: []
    };
    if (variantId && mongoose.Types.ObjectId.isValid(String(variantId))) {
      seed._id = new mongoose.Types.ObjectId(String(variantId));
    }
    productDoc.bienthe.push(seed);
    variant = productDoc.bienthe[productDoc.bienthe.length - 1];
  }

  if (hasSize) {
    const sizeKey = String(size || '').trim();
    if (!sizeKey) throw new Error('Thiếu size cho sản phẩm biến thể có size');
    variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
    const row = variant.sizes.find((s) => String(s.size || '') === sizeKey);
    if (row) row.soluong = Number(row.soluong || 0) + soLuong;
    else variant.sizes.push({ size: sizeKey, soluong: soLuong });
  } else {
    variant.soluong = Number(variant.soluong || 0) + soLuong;
  }
}

async function getDanhSachData(query = {}) {
  const { boloc, keyword, status, paymentMethod, fromDate, toDate, sort, limit } = taoBoLocTuQuery(query);

  const tongdon = await Donhang.countDocuments(boloc);
  let phantrang = { currentPage: 1, limit };
  phantrang = paginationHelper(phantrang, query, tongdon);

  const danhsach = await Donhang.find(boloc)
    .sort(sortMap(sort))
    .skip(phantrang.skip)
    .limit(phantrang.limit)
    .lean();
  await ganThongTinHoanHangChoDanhSachDon(danhsach);

  const orderIds = (danhsach || [])
    .map((row) => row && row._id)
    .filter(Boolean);
  const returnReceiptRows = orderIds.length
    ? await PhieuNhapKho.find({
      donhang_id: { $in: orderIds },
      loaiphieu: 'return'
    })
      .select('_id donhang_id maphieu daxuatkho')
      .sort({ ngaytao: -1, _id: -1 })
      .lean()
    : [];
  const returnReceiptMap = new Map();
  for (const row of (returnReceiptRows || [])) {
    const key = String(row?.donhang_id || '').trim();
    if (!key || returnReceiptMap.has(key)) continue;
    returnReceiptMap.set(key, row);
  }

  const danhsachXuLy = (danhsach || []).map((o) => {
    const allowedNext = (CHUYEN_TRANG_THAI[o.trangthai] || []).filter((s) => s !== 'dahuy');
    const returnImportReceipt = returnReceiptMap.get(String(o._id || '')) || null;
    return {
      ...o,
      allowedNext,
      label: layNhanTrangThai(o.trangthai),
      hasReturnImport: Boolean(returnImportReceipt),
      hasConfirmedReturnImport: Boolean(returnImportReceipt && returnImportReceipt.daxuatkho),
      returnImportReceipt
    };
  });

  const filterString = taoChuoiBoLoc({
    keyword: keyword || '',
    status: status !== 'all' ? status : '',
    payment: paymentMethod || '',
    fromDate: query.fromDate || '',
    toDate: query.toDate || '',
    sort: sort || 'newest',
    limit
  });
  const currentListUrl = `/admin/orders?page=${phantrang.currentPage}${filterString || ''}`;
  const exportQuery = filterString ? `?${filterString.replace(/^&/, '')}` : '';

  return {
    titlePage: 'Quản lý đơn hàng',
    orders: danhsachXuLy,
    filters: {
      search: keyword || '',
      status,
      paymentMethod,
      fromDate,
      toDate,
      sort,
      limit
    },
    pagination: phantrang,
    statusLabels: ADMIN_STATUS_LABELS,
    statusOptions: ORDER_FILTER_STATUS_OPTIONS,
    bulkStatusOptions: ORDER_BULK_STATUS_OPTIONS,
    badgeClass: buildBadgeClass,
    filterString,
    currentListUrl,
    exportQuery
  };
}

function getDanhSachFallbackData() {
  return {
    titlePage: 'Quản lý đơn hàng',
    orders: [],
    filters: { search: '', status: 'all', paymentMethod: '', fromDate: '', toDate: '', sort: 'newest', limit: 10 },
    pagination: { currentPage: 1, limit: 10, skip: 0, totalPages: 0, totalProducts: 0 },
    statusLabels: ADMIN_STATUS_LABELS,
    statusOptions: ORDER_FILTER_STATUS_OPTIONS,
    bulkStatusOptions: ORDER_BULK_STATUS_OPTIONS,
    badgeClass: buildBadgeClass,
    filterString: '',
    currentListUrl: '/admin/orders',
    exportQuery: ''
  };
}

async function getChiTietData(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, code: 'INVALID_ID', message: 'ID không hợp lệ!' };
  }

  const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } }).lean();
  if (!order) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy đơn hàng' };
  }
  await ganThongTinHoanHangChoDon(order);

  const returnImportReceipt = await PhieuNhapKho.findOne({
    donhang_id: order._id,
    loaiphieu: 'return'
  })
    .select('_id maphieu daxuatkho chitiet tongtiennhap')
    .lean();
  const hasReturnImport = Boolean(returnImportReceipt);
  const hasConfirmedReturnImport = Boolean(returnImportReceipt && returnImportReceipt.daxuatkho);

  const [itemsRaw, exportReceipt] = await Promise.all([
    Chitietdonhang.find({ donhang_id: order._id }).lean(),
    PhieuXuatKho.findOne({ donhang_id: order._id })
      .select('chitiet tongdoanhthuhoan')
      .lean()
  ]);
  const items = (itemsRaw || []).map((it) => {
    const unitOriginalPrice = Math.max(0, Number(it?.giagoc || 0));
    const unitDiscountedPrice = Math.max(0, Number(it?.giaban || it?.giagoc || 0));

    const fifoRows = Array.isArray(it?.fifoAllocations)
      ? it.fifoAllocations
        .map((a) => {
          const soLuong = Math.max(0, Number(a?.soLuong || 0));
          if (soLuong <= 0) return null;

          const giaGocLo = unitOriginalPrice;
          const giaBanLo = unitDiscountedPrice > 0 ? unitDiscountedPrice : unitOriginalPrice;
          const thanhTienLo = Math.max(0, Math.round(giaBanLo * soLuong));
          return {
            soLuong,
            giagoc: giaGocLo,
            giaban: giaBanLo,
            thanhtien: thanhTienLo
          };
        })
        .filter(Boolean)
      : [];

    const tongSoLuong = fifoRows.length
      ? fifoRows.reduce((sum, row) => sum + Number(row.soLuong || 0), 0)
      : Math.max(0, Number(it?.soluong || 0));
    const tongThanhTien = fifoRows.length
      ? fifoRows.reduce((sum, row) => sum + Number(row.thanhtien || 0), 0)
      : Math.max(0, Number(it?.thanhtien || ((it?.giaban || it?.giagoc || 0) * (it?.soluong || 1)) || 0));

    return {
      ...it,
      fifoRows,
      tongSoLuong,
      tongThanhTien
    };
  });

  const itemById = new Map((items || []).map((it) => [String(it._id), it]));
  const rawRequestedItems = (order && order.yeucauhoanhang && (order.yeucauhoanhang.requestedItems || order.yeucauhoanhang.returnItems)) || [];
  const normalizedRequestedRows = Array.isArray(rawRequestedItems)
    ? rawRequestedItems
    : (rawRequestedItems && typeof rawRequestedItems === 'object')
      ? Object.keys(rawRequestedItems)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => rawRequestedItems[key])
      : [];

  const returnRequestItems = normalizedRequestedRows
    .map((row) => {
      const orderItemId = String(row && (row.orderItemId || row._id) ? (row.orderItemId || row._id) : '').trim();
      const itemRef = orderItemId ? itemById.get(orderItemId) : null;
      const qty = Math.max(0, Number(row && (row.qty ?? row.soluong) || 0) || 0);
      const boughtQty = Math.max(0, Number(row && (row.boughtQty ?? row.soluongMua) || (itemRef ? itemRef.soluong : 0)) || 0);

      return {
        orderItemId,
        qty,
        boughtQty,
        tensanpham: String(row && (row.tensanpham || row.tenSanPham) || (itemRef ? itemRef.tensanpham : '') || '').trim(),
        hinhanh: String(row && row.hinhanh || (itemRef ? itemRef.hinhanh : '') || '').trim(),
        kichco: String(row && (row.kichco || row.kichCo) || (itemRef ? itemRef.kichco : '') || '').trim(),
        mausac: String(row && (row.mausac || row.mauSac) || (itemRef ? itemRef.mausac : '') || '').trim()
      };
    })
    .filter((row) => row.orderItemId || row.qty > 0 || row.boughtQty > 0 || row.tensanpham);

  const hasReturnRequest = Boolean(order && order.yeucauhoanhang && order.yeucauhoanhang.requestedAt);
  const returnRequestItemsMissing = hasReturnRequest && returnRequestItems.length === 0;
  const returnActualSummary = (returnImportReceipt && !hasConfirmedReturnImport)
    ? buildReturnedItemSummaryFromImportReceipt({
      importReceipt: returnImportReceipt,
      orderItems: itemsRaw || []
    })
    : buildReturnedItemSummary({ exportReceipt, orderItems: itemsRaw || [] });
  const returnActualTotalQty = Math.max(
    0,
    toPositiveInt(returnActualSummary.totalReturnedQty, 0) || toPositiveInt(order?.tongsoluong_hoantra, 0)
  );
  const returnActualTotalAmount = Math.max(
    0,
    roundMoney(returnActualSummary.totalRefundAmount || 0)
    || roundMoney(order?.tonggiamdoanhthu_hoantra || 0)
    || roundMoney(order?.yeucauhoanhang?.refundAmount || 0)
  );
  const returnActualDetailsMissing = (returnActualTotalQty > 0 || returnActualTotalAmount > 0)
    && (!Array.isArray(returnActualSummary.items) || returnActualSummary.items.length === 0);
  const refundFinancialSummary = buildAdminRefundFinancialSummary({
    order,
    items,
    returnRequestItems,
    returnedQtyByItemId: returnActualSummary.returnedQtyByItemId,
    returnActualTotalAmount,
    statusLabels: ADMIN_STATUS_LABELS
  });

  const allowedNext = (CHUYEN_TRANG_THAI[order.trangthai] || [])
    .filter((s) => s !== 'dahuy')
    .filter((s) => !RETURN_STEP_STATUSES.has(s));

  return {
    ok: true,
    data: {
      titlePage: `Chi tiết ${order.madonhang || 'Đơn hàng'}`,
      order,
      items,
      returnRequestItems,
      returnRequestItemsMissing,
      returnActualItems: returnActualSummary.items,
      returnedQtyByItemId: returnActualSummary.returnedQtyByItemId,
      returnActualTotalQty,
      returnActualTotalAmount,
      returnActualDetailsMissing,
      refundFinancialSummary,
      hasReturnImport,
      hasConfirmedReturnImport,
      returnImportReceipt,
      statusLabels: ADMIN_STATUS_LABELS,
      flow: ADMIN_FLOW,
      allowedNext,
      badgeClass: buildBadgeClass
    }
  };
}

async function buildExportWorkbook(query = {}) {
  const { boloc } = taoBoLocTuQuery(query);
  const rows = await Donhang.find(boloc).sort({ ngaytao: -1 }).lean();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMDT_ThoiTrang';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('DonHang');
  worksheet.columns = [
    { header: 'Mã Đơn', key: 'madon', width: 16 },
    { header: 'Khách Hàng', key: 'khachhang', width: 24 },
    { header: 'SĐT', key: 'sdt', width: 16 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Thanh toán', key: 'thanhtoan', width: 14 },
    { header: 'Trạng thái', key: 'trangthai', width: 18 },
    { header: 'Tổng tiền', key: 'tongtien', width: 14 },
    { header: 'Ngày tạo', key: 'ngaytao', width: 22 }
  ];

  for (const o of (rows || [])) {
    worksheet.addRow({
      madon: String(o.madonhang || ''),
      khachhang: String(o.tennguoinhan || ''),
      sdt: String(o.sodienthoai || ''),
      email: String(o.email || ''),
      thanhtoan: String((o.phuongthucthanhtoan || '').toUpperCase()),
      trangthai: String(layNhanTrangThai(o.trangthai)),
      tongtien: Number(o.tongtien || o.tamtinh || 0),
      ngaytao: o.ngaytao ? new Date(o.ngaytao) : null
    });
  }

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.getColumn('sdt').numFmt = '@';
  worksheet.getColumn('madon').numFmt = '@';
  worksheet.getColumn('tongtien').numFmt = '#,##0';
  worksheet.getColumn('ngaytao').numFmt = 'dd/mm/yyyy hh:mm:ss';

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });

  worksheet.columns.forEach((column) => {
    let maxLength = String(column.header || '').length;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value;
      let cellText = '';
      if (value instanceof Date) {
        cellText = value.toISOString();
      } else if (value && typeof value === 'object' && value.richText) {
        cellText = value.richText.map((part) => part.text || '').join('');
      } else {
        cellText = value !== null && value !== undefined ? String(value) : '';
      }
      if (cellText.length > maxLength) maxLength = cellText.length;
    });
    column.width = Math.min(Math.max(maxLength + 2, 12), 50);
  });

  return workbook;
}

async function getTongQuanDonMoiData() {
  const filter = { daxoa: { $ne: true }, trangthai: 'choxacnhan' };
  const [count, latest] = await Promise.all([
    Donhang.countDocuments(filter),
    Donhang.findOne(filter)
      .sort({ ngaytao: -1 })
      .select('_id madonhang tennguoinhan ngaytao')
      .lean()
  ]);

  return {
    success: true,
    count: Number(count || 0),
    latestOrder: latest
      ? {
        id: String(latest._id),
        madonhang: latest.madonhang || '',
        tennguoinhan: latest.tennguoinhan || '',
        ngaytao: latest.ngaytao || null
      }
      : null
  };
}

async function capNhatTrangThaiDon({ id, nextStatus, actor }) {
  const orderId = String(id || '');
  const status = String(nextStatus || '').trim();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, code: 'INVALID_ID', message: 'ID không hợp lệ!' };
  }

  if (!TAP_TRANG_THAI.has(status) || status === 'dahuy') {
    return { ok: false, code: 'INVALID_STATUS', message: 'Trạng thái không hợp lệ!' };
  }

  if (['returned', 'returned_full', 'returned_partial'].includes(status)) {
    return {
      ok: false,
      code: 'RETURN_RECEIVE_REQUIRED',
      message: 'Vui lòng dùng thao tác "Xác nhận nhận hàng hoàn" để cập nhật hàng hoàn thực tế.'
    };
  }

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy đơn hàng' };
  }

  const allowedNext = CHUYEN_TRANG_THAI[order.trangthai] || [];
  if (!allowedNext.includes(status)) {
    return { ok: false, code: 'INVALID_FLOW', message: 'Không thể chuyển trạng thái theo luồng hiện tại' };
  }

  // Refunded must run full refund flow to keep stock/report data consistent.
  if (status === 'refunded') {
    const refundResult = await hoanTienDon(orderId, actor);
    if (!refundResult || !refundResult.ok) {
      return {
        ok: false,
        code: 'REFUND_FLOW_FAILED',
        message: (refundResult && refundResult.message) || 'Không thể hoàn tiền theo quy trình chuẩn.'
      };
    }
    return { ok: true, message: refundResult.message || 'Đã hoàn tiền thành công.' };
  }

  const updateResult = await Donhang.updateOne(
    { _id: orderId, trangthai: order.trangthai, daxoa: { $ne: true } },
    {
      $set: {
        trangthai: status,
        ngaycapnhat: new Date(),
        ...(status === 'dagiao' ? { ngaygiaohang: new Date() } : {})
      }
    }
  );

  if (!updateResult || Number(updateResult.modifiedCount || 0) === 0) {
    return {
      ok: false,
      code: 'CONFLICT',
      message: 'Không thể cập nhật trạng thái (dữ liệu có thể đã bị thay đổi)'
    };
  }

  try {
    if (status === 'daxacnhan') {
      await taoPhieuXuatTuDonHang({
        orderId,
        adminUser: actor,
        note: 'Tự động tạo khi đơn hàng được xác nhận',
        skipInventoryAdjustments: true
      });
      const mailResult = await sendOrderConfirmedEmail({ orderId });
      if (!mailResult.sent && mailResult.reason === 'already-sent') {
        console.log('ORDER_CONFIRM_EMAIL_SKIPPED_ALREADY_SENT', { orderId });
      }
    }

    if (status === 'dagiao') {
      const mailResult = await sendOrderDeliveredEmail({ orderId });
      if (!mailResult.sent && mailResult.reason === 'already-sent') {
        console.log('ORDER_DELIVERED_EMAIL_SKIPPED_ALREADY_SENT', { orderId });
      }
    }
  } catch (mailError) {
    if (status === 'daxacnhan') {
      await Donhang.updateOne(
        { _id: orderId, trangthai: status, daxoa: { $ne: true } },
        { $set: { trangthai: order.trangthai, ngaycapnhat: new Date() } }
      ).catch(() => {});
      return {
        ok: false,
        code: 'SIDE_EFFECT_ERROR',
        message: 'Không thể cập nhật trạng thái do lỗi tạo phiếu xuất hoặc gửi email.'
      };
    }

    await dongBoSidecarAnToan('order status sidecar sync', async () => {
      await ghiNhanLichSuTrangThaiDonHang({
        order: {
          _id: order._id,
          nguoidung_id: order.nguoidung_id,
          madonhang: order.madonhang
        },
        previousStatus: String(order.trangthai || ''),
        nextStatus: status,
        action: 'admin_updated_order_status',
        actor,
        metadata: {
          mailError: true
        }
      });
    });

    return {
      ok: false,
      code: 'MAIL_ERROR',
      message: 'Đã cập nhật trạng thái nhưng gửi email thất bại. Vui lòng kiểm tra SMTP/log.'
    };
  }

  await dongBoSidecarAnToan('order status sidecar sync', async () => {
    await ghiNhanLichSuTrangThaiDonHang({
      order: {
        _id: order._id,
        nguoidung_id: order.nguoidung_id,
        madonhang: order.madonhang
      },
      previousStatus: String(order.trangthai || ''),
      nextStatus: status,
      action: 'admin_updated_order_status',
      actor,
      metadata: {
        emailTriggered: status === 'daxacnhan' || status === 'dagiao'
      }
    });
  });

  return { ok: true, message: 'Cập nhật trạng thái thành công' };
}

async function duyetHoanHang({ id, note, actor = null }) {
  const orderId = String(id || '');
  const adminNote = String(note || '').trim();

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };
  await ganThongTinHoanHangChoDon(order);
  if (String(order.trangthai) !== 'requested_return') {
    return { ok: false, message: 'Đơn không ở trạng thái chờ duyệt hoàn hàng' };
  }

  const previousStatus = String(order.trangthai || '');
  order.trangthai = 'approved_return';
  order.ngaycapnhat = new Date();
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    reviewedAt: new Date(),
    approvedAt: new Date(),
    adminNote: adminNote || (order.yeucauhoanhang && order.yeucauhoanhang.adminNote) || ''
  };
  await order.save();
  await dongBoSidecarAnToan('approve return sidecar sync', async () => {
    await dongBoYeuCauHoanHangTuDon({
      order,
      action: 'admin_approved_return',
      actor
    });
    await ghiNhanLichSuTrangThaiDonHang({
      order,
      previousStatus,
      nextStatus: String(order.trangthai || ''),
      action: 'admin_approved_return',
      actor,
      note: adminNote
    });
  });

  return { ok: true, message: 'Đã duyệt yêu cầu hoàn hàng.' };
}

async function tuChoiHoanHang({ id, note, actor = null }) {
  const orderId = String(id || '');
  const adminNote = String(note || '').trim();

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };
  await ganThongTinHoanHangChoDon(order);
  if (String(order.trangthai) !== 'requested_return') {
    return { ok: false, message: 'Đơn không ở trạng thái chờ duyệt hoàn hàng' };
  }

  const previousStatus = String(order.trangthai || '');
  order.trangthai = 'rejected_return';
  order.ngaycapnhat = new Date();
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    reviewedAt: new Date(),
    rejectedAt: new Date(),
    adminNote: adminNote || 'Yêu cầu hoán hàng chưa đáp ứng điều kiện'
  };
  await order.save();
  await dongBoSidecarAnToan('reject return sidecar sync', async () => {
    await dongBoYeuCauHoanHangTuDon({
      order,
      action: 'admin_rejected_return',
      actor
    });
    await ghiNhanLichSuTrangThaiDonHang({
      order,
      previousStatus,
      nextStatus: String(order.trangthai || ''),
      action: 'admin_rejected_return',
      actor,
      note: adminNote || 'Yêu cầu hoán hàng chưa đáp ứng điều kiện'
    });
  });

  return { ok: true, message: 'Đã từ chối yêu cầu hoàn hàng.' };
}

async function xacNhanDaNhanHangHoan({ id, payload = {}, actor = null }) {
  const orderId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, message: 'ID không hợp lệ' };
  }

  return dongBoNhapKhoHoanTra({
    id: orderId,
    payload,
    actor
  });
}

async function hoanTienDon(id, actor = null) {
  const orderId = String(id || '');
  let order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };
  await ganThongTinHoanHangChoDon(order);
  if (!['returned', 'returned_full', 'returned_partial'].includes(String(order.trangthai))) {
    return { ok: false, message: 'Đơn hàng chưa ở trạng thái đã nhận hàng hoàn.' };
  }

  const exportReceipt = await PhieuXuatKho.findOne({ donhang_id: order._id })
    .select('chitiet tongdoanhthuhoan')
    .lean();
  const actualSummary = buildReturnedItemSummary({
    exportReceipt,
    orderItems: []
  });
  const actualReturnedQty = Math.max(0, toPositiveInt(actualSummary?.totalReturnedQty, 0));
  const actualReturnedAmount = Math.max(
    0,
    roundMoney(actualSummary?.totalRefundAmount || exportReceipt?.tongdoanhthuhoan || 0)
  );

  if (actualReturnedQty <= 0 && actualReturnedAmount <= 0) {
    return {
      ok: false,
      message: 'Chưa có dữ liệu hàng hoàn thực tế. Vui lòng bấm "Xác nhận đã nhận hàng hoàn" trước khi hoàn tiền.'
    };
  }

  // Refund is allowed right after confirming actual returned goods.
  // The return import receipt is created only after refund succeeds.
  const paymentMethod = String(order.phuongthucthanhtoan || '').trim().toLowerCase();
  const requestedRefundMethod = String((order.yeucauhoanhang && order.yeucauhoanhang.refundMethod) || '').trim().toLowerCase();
  const requestedRefundWallet = String((order.yeucauhoanhang && order.yeucauhoanhang.refundWallet) || '').trim().toLowerCase();

  let refundMethod = requestedRefundMethod || paymentMethod || 'bank';
  if (refundMethod === 'wallet') {
    if (requestedRefundWallet === 'momo' || requestedRefundWallet === 'vnpay') {
      refundMethod = requestedRefundWallet;
    } else if (paymentMethod === 'momo' || paymentMethod === 'vnpay') {
      refundMethod = paymentMethod;
    } else {
      refundMethod = 'bank';
    }
  }

  if (!['momo', 'vnpay', 'bank'].includes(refundMethod)) {
    refundMethod = 'bank';
  }
  let soTienHoan = Math.max(
    0,
    Math.round(
      Number(
        (order.yeucauhoanhang && order.yeucauhoanhang.refundAmount)
        || order.tonggiamdoanhthu_hoantra
        || 0
      )
    )
  );
  const soTienTinhTheoVoucherPhanBo = await tinhSoTienHoanTheoYeuCau(order);
  const daTinhHoanTheoVoucher = soTienTinhTheoVoucherPhanBo > 0;

  // Always prioritize standardized proportional-refund calculation.
  if (daTinhHoanTheoVoucher) {
    soTienHoan = soTienTinhTheoVoucherPhanBo;
  }

  const tongDaGiamDoanhThu = Math.max(0, roundMoney(order.tonggiamdoanhthu_hoantra || 0));
  const tongThanhToanHienTai = Math.max(0, roundMoney(order.tongtien || order.tamtinh || 0));
  const tongThanhToanBanDau = Math.max(0, tongThanhToanHienTai + tongDaGiamDoanhThu);

  if (soTienHoan <= 0 && String(order.trangthai) === 'returned_full') {
    soTienHoan = Math.max(0, tongThanhToanBanDau || tongThanhToanHienTai);
  }

  if (soTienHoan <= 0) {
    return {
      ok: false,
      message: 'Không xác nhận được số tiền hoàn hợp lệ. Vui lòng kiểm tra lại số lượng sản phẩm hoàn.'
    };
  }

  // Refund cap must be based on original payable amount, not current remaining payable.
  // If voucher-aware refund is already computed, never clamp below that computed value.
  const gioiHanHoanTheoTongDon = Math.max(0, tongThanhToanBanDau || tongThanhToanHienTai);
  const gioiHanHoan = daTinhHoanTheoVoucher
    ? Math.max(gioiHanHoanTheoTongDon, Math.max(0, roundMoney(soTienTinhTheoVoucherPhanBo)))
    : gioiHanHoanTheoTongDon;
  if (gioiHanHoan > 0) {
    soTienHoan = Math.min(soTienHoan, gioiHanHoan);
  }

  if (refundMethod === 'bank') {
    const bankName = String(order.yeucauhoanhang?.refundBankName || '').trim();
    const bankAccountName = String(order.yeucauhoanhang?.refundBankAccountName || '').trim();
    const bankAccountNumber = String(order.yeucauhoanhang?.refundBankAccountNumber || '').trim();
    if (!bankName || !bankAccountName || !bankAccountNumber) {
      return { ok: false, message: 'Thiếu thông tin nhận hoàn tiền ngân hàng của khách hàng.' };
    }
  }

  if (refundMethod === 'vnpay') {
    if (!order.vnpayTxnRef && !order.vnpayTransId) {
      return { ok: false, message: 'Không tìm thấy giao dịch VNPAY để hoàn tiền.' };
    }
  }

  if (refundMethod === 'momo') {
    if (!order.momoTransId) {
      return { ok: false, message: 'Không tìm thấy mã giao dịch MoMo để hoàn tiền.' };
    }

    if (!order.momoRefunded) {
      const refundRefs = taoThongTinYeuCauHoanTienMoMo(String(order._id));
      const ketqua = await taoHoanTienMoMo({
        orderId: refundRefs.orderId,
        requestId: refundRefs.requestId,
        amount: Math.max(0, Math.round(soTienHoan)),
        transId: Number(order.momoTransId),
        description: `Hoàn tiền đơn hàng ${order.madonhang || String(order._id)}`
      });

      if (!(ketqua && (ketqua.resultCode === 0 || ketqua.message === 'Success'))) {
        return { ok: false, message: ketqua?.message || 'Yêu cầu hoàn tiền MoMo thất bại.' };
      }

      order.momoRefunded = true;
      order.momoRefundAt = new Date();
    }
  }

  await capNhatGiaoDichThanhToan({
    donhangId: order._id,
    nguoidungId: order.nguoidung_id,
    phuongthuc: refundMethod === 'bank' ? 'banking' : refundMethod,
    sotien: soTienHoan,
    trangthai: 'refunded',
    ghichu: 'Hoàn tiền đơn hàng sau khi nhận hàng hoàn',
    response: {
      manualRefundByAdmin: true,
      refundedAt: new Date().toISOString(),
      refundMethod,
      refundWallet: String(order.yeucauhoanhang?.refundWallet || ''),
      refundBankName: String(order.yeucauhoanhang?.refundBankName || ''),
      refundBankAccountName: String(order.yeucauhoanhang?.refundBankAccountName || ''),
      refundBankAccountNumber: String(order.yeucauhoanhang?.refundBankAccountNumber || '')
    }
  });

  const previousStatus = String(order.trangthai || '');
  order.trangthai = 'refunded';
  order.ngaycapnhat = new Date();
  order.tonggiamdoanhthu_hoantra = Math.max(0, roundMoney(soTienHoan));
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    refundAmount: Math.max(0, roundMoney(soTienHoan)),
    refundedAt: new Date()
  };
  await order.save();
  await dongBoSidecarAnToan('refund order sidecar sync', async () => {
    await dongBoYeuCauHoanHangTuDon({
      order,
      action: 'admin_refunded_order',
      actor
    });
    await ghiNhanLichSuTrangThaiDonHang({
      order,
      previousStatus,
      nextStatus: String(order.trangthai || ''),
      action: 'admin_refunded_order',
      actor,
      metadata: {
        refundAmount: Math.max(0, roundMoney(soTienHoan))
      }
    });
  });

  return { ok: true, message: 'Đã hoàn tiền thành công.' };
}

async function capNhatTrangThaiHangLoat({ orderIds, nextStatus, actor }) {
  const status = String(nextStatus || '').trim();

  const ids = Array.from(new Set(
    (Array.isArray(orderIds) ? orderIds : [])
      .map((id) => String(id || '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  ));

  if (!ids.length) {
    return { ok: false, message: 'Vui lòng chọn ít nhất một đơn hàng' };
  }

  if (!TAP_TRANG_THAI.has(status) || status === 'dahuy') {
    return { ok: false, message: 'Trạng thái cập nhật không hợp lệ!' };
  }

  const orders = await Donhang.find({ _id: { $in: ids }, daxoa: { $ne: true } }).lean();

  let updatedCount = 0;
  let skippedCount = 0;
  let mailErrorCount = 0;
  let refundErrorCount = 0;

  for (const order of (orders || [])) {
    const allowedNext = CHUYEN_TRANG_THAI[order.trangthai] || [];
    if (!allowedNext.includes(status)) {
      skippedCount += 1;
      continue;
    }

    if (status === 'refunded') {
      const refundResult = await hoanTienDon(String(order._id), actor);
      if (refundResult && refundResult.ok) {
        updatedCount += 1;
      } else {
        skippedCount += 1;
        refundErrorCount += 1;
        console.error('bulk order refund flow error:', {
          orderId: String(order._id),
          message: refundResult && refundResult.message ? refundResult.message : 'UNKNOWN'
        });
      }
      continue;
    }

    const updateResult = await Donhang.updateOne(
      { _id: order._id, trangthai: order.trangthai, daxoa: { $ne: true } },
      { $set: { trangthai: status, ngaycapnhat: new Date() } }
    );

    if (!updateResult || Number(updateResult.modifiedCount || 0) === 0) {
      skippedCount += 1;
      continue;
    }

    updatedCount += 1;
    let loggedStatusTransition = false;

    try {
      if (status === 'daxacnhan') {
        await taoPhieuXuatTuDonHang({
          orderId: order._id,
          adminUser: actor,
          note: 'Tự động tạo khi đơn hàng được xác nhận hàng loạt',
          skipInventoryAdjustments: true
        });
        await sendOrderConfirmedEmail({ orderId: order._id });
      }
      if (status === 'dagiao') {
        await sendOrderDeliveredEmail({ orderId: order._id });
      }
    } catch (mailError) {
      if (status === 'daxacnhan') {
        await Donhang.updateOne(
          { _id: order._id, trangthai: status, daxoa: { $ne: true } },
          { $set: { trangthai: order.trangthai, ngaycapnhat: new Date() } }
        ).catch(() => {});
        updatedCount = Math.max(0, updatedCount - 1);
        skippedCount += 1;
      }
      mailErrorCount += 1;
      if (status !== 'daxacnhan') {
        await dongBoSidecarAnToan('bulk order status sidecar sync', async () => {
          await ghiNhanLichSuTrangThaiDonHang({
            order,
            previousStatus: String(order.trangthai || ''),
            nextStatus: status,
            action: 'admin_bulk_updated_order_status',
            actor,
            metadata: { mailError: true }
          });
        });
        loggedStatusTransition = true;
      }
      console.error('bulk order status side effect error:', { orderId: String(order._id), error: mailError });
    }

    if (!loggedStatusTransition) {
      await dongBoSidecarAnToan('bulk order status sidecar sync', async () => {
        await ghiNhanLichSuTrangThaiDonHang({
          order,
          previousStatus: String(order.trangthai || ''),
          nextStatus: status,
          action: 'admin_bulk_updated_order_status',
          actor
        });
      });
    }
  }

  if (updatedCount === 0) {
    return { ok: false, message: 'Kh không có đơn hàng nào được cập nhật trạng thái' };
  }

  let message = `Đã cập nhật ${updatedCount} đơn hàng`;
  if (skippedCount > 0) message += `, bỏ qua ${skippedCount} đơn hàng không đủ điều kiện`;
  if (mailErrorCount > 0) message += `, ${mailErrorCount} đơn hàng gửi email thất bại`;
  if (refundErrorCount > 0) message += `, ${refundErrorCount} đơn hàng hoàn tiền thất bại`;

  return { ok: true, message };
}

async function huyDon({ id, reason, actor = null }) {
  const orderId = String(id || '');
  const lydo = String(reason || '').trim() || 'Admin hủy đơn hàng';

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, code: 'INVALID_ID', message: 'ID không hợp lệ!' };
  }

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy đơn hàng' };

  if (!['choxacnhan', 'daxacnhan'].includes(order.trangthai)) {
    return { ok: false, code: 'INVALID_STATE', message: 'Đơn hàng không thể hủy ở trạng thái hiện tại' };
  }

  const refundAmount = Math.max(0, roundMoney(order.tongtien || order.tamtinh || 0));
  let daHoanTien = false;

  // Nếu đơn hàng đã thanh toán mà admin không xác nhận, phải hoàn tiền trước khi hủy.
  if (order.dathanhtoan) {
    const paymentMethod = String(order.phuongthucthanhtoan || '').toLowerCase();

    if (paymentMethod === 'momo') {
      if (!order.momoTransId) {
        return {
          ok: false,
          code: 'REFUND_MISSING_TRANS_ID',
          message: 'Đơn hàng thanh toán MoMo nhưng thiếu mã giao dịch để hoàn tiền.'
        };
      }

      if (!order.momoRefunded) {
        let ketquaHoan;
        try {
          const refundRefs = taoThongTinYeuCauHoanTienMoMo(String(order._id));
          ketquaHoan = await taoHoanTienMoMo({
            orderId: refundRefs.orderId,
            requestId: refundRefs.requestId,
            amount: refundAmount,
            transId: Number(order.momoTransId),
            description: `Hoàn tiền đơn hàng ${order.madonhang || String(order._id)} do không xác nhận`
          });
        } catch (error) {
          return {
            ok: false,
            code: 'REFUND_API_ERROR',
            message: `Không thấy kết nối với hoàn tiền MoMo: ${error && error.message ? error.message : 'UNKNOWN'}`
          };
        }

        if (!(ketquaHoan && (ketquaHoan.resultCode === 0 || ketquaHoan.message === 'Success'))) {
          return {
            ok: false,
            code: 'REFUND_FAILED',
            message: ketquaHoan?.message || 'Hoàn tiền MoMo thất bại, chưa thể hủy đơn.'
          };
        }

        await Donhang.updateOne(
          { _id: order._id, daxoa: { $ne: true } },
          { $set: { momoRefunded: true, momoRefundAt: new Date(), ngaycapnhat: new Date() } }
        );

        await capNhatGiaoDichThanhToan({
          donhangId: order._id,
          nguoidungId: order.nguoidung_id,
          phuongthuc: 'momo',
          sotien: refundAmount,
          magiaodich: order.momoOrderId || undefined,
          trangthai: 'refunded',
          ghichu: 'Admin không xác nhận đơn, hoàn tiền thất bại',
          response: { cancel: true, reason: lydo, refundedAt: new Date().toISOString() }
        }).catch(() => {});
      }

      daHoanTien = true;
    } else {
      // Với phương thức khác MoMo: ghi nhận đã hoàn tiền thủ công để không chặn hủy đơn.
      await capNhatGiaoDichThanhToan({
        donhangId: order._id,
        nguoidungId: order.nguoidung_id,
        phuongthuc: paymentMethod || 'banking',
        sotien: refundAmount,
        trangthai: 'refunded',
        ghichu: 'Admin không xác nhận đơn, hoàn tiền thành công',
        response: { cancel: true, reason: lydo, manualRefundByAdmin: true, refundedAt: new Date().toISOString() }
      }).catch(() => {});
      daHoanTien = true;
    }
  }

  const updated = await Donhang.findOneAndUpdate(
    { _id: orderId, daxoa: { $ne: true }, trangthai: order.trangthai },
    { $set: { trangthai: 'dahuy', lydohuy: lydo, ngaycapnhat: new Date() } },
    { new: true }
  );

  if (!updated) {
    return { ok: false, code: 'CONFLICT', message: 'Không thể hủy đơn hàng' };
  }

  try {
    await restoreVoucherUsageForUser({
      voucherId: updated.voucher_id,
      userId: updated.nguoidung_id
    });
  } catch (error) {
    console.error('admin cancel restore voucher error:', error);
  }

  const danhsachitem = await Chitietdonhang.find({ donhang_id: updated._id });
  const danhsachloi = [];

  for (const it of (danhsachitem || [])) {
    try {
      await congTonChoChiTietDon(it);
    } catch (e) {
      danhsachloi.push(e?.message || 'Có lỗi khi hoàn tồn kho');
    }
  }

  try {
    await Chitietdonhang.updateMany(
      { donhang_id: updated._id },
      { $set: { trangthai: 'dahuy' } }
    );
  } catch {
    // best-effort
  }

  await dongBoSidecarAnToan('admin cancel order log', async () => {
    await ghiNhanLichSuTrangThaiDonHang({
      order: updated,
      previousStatus: String(order.trangthai || ''),
      nextStatus: 'dahuy',
      action: 'admin_canceled_order',
      actor,
      note: lydo,
      metadata: { refundedByAdminCancel: daHoanTien }
    });
  });

  try {
    await danhDauThatBaiTatCaPendingTheoDonHang({
      donhangId: updated._id,
      response: { cancel: true, reason: lydo },
      ghichu: 'Hủy đơn hàng, đánh dấu tất cả pending thất bại'
    });
  } catch {
    // best-effort
  }

  if (danhsachloi.length) {
    return {
      ok: true,
      message: 'Đã hủy đơn hàng nhưng có lỗi khi hoàn tồn kho cho một số sản phẩm.',
      isPartial: true,
      orderId: updated._id
    };
  }

  return {
    ok: true,
    message: daHoanTien
      ? 'Đã hủy đơn hàng và hoàn tiền cho khách.'
      : 'Đã hủy đơn hàng',
    orderId: updated._id
  };
}

module.exports = {
  ADMIN_STATUS_LABELS,
  TRANG_THAI_CHO_PHEP,
  ORDER_FILTER_STATUS_OPTIONS,
  ORDER_BULK_STATUS_OPTIONS,
  ADMIN_FLOW,
  buildBadgeClass,
  layDuongDanDanhSachMacDinh,
  layDuongDanQuayLaiDanhSach,
  taoDuongDanChiTietDon,
  taoTenFileXuatDonHang,
  xacDinhLoaiFlashKetQua,
  layDuongDanDanhSachHopLe,
  getDanhSachData,
  getDanhSachFallbackData,
  getChiTietData,
  buildExportWorkbook,
  getTongQuanDonMoiData,
  capNhatTrangThaiDon,
  duyetHoanHang,
  tuChoiHoanHang,
  xacNhanDaNhanHangHoan,
  hoanTienDon,
  capNhatTrangThaiHangLoat,
  huyDon
};
