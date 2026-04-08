const mongoose = require('mongoose');
const donhang = require('../../models/order_model');
const chitietdonhang = require('../../models/order_item_model');
const OrderStatusLog = require('../../models/order_status_log_model');
const InventoryLot = require('../../models/inventory_lot_model');
const danhgia = require('../../models/review_model');
const sanpham = require('../../models/product_model');
const { getOrCreateCart, normalizeImage } = require('../cart.service');
const { laLoaiKhongSize, tinhTongTon } = require('../catalog/productStock.service.js');
const {
  taoHoanTienMoMo,
  taoThanhToanMoMo,
  taoThongTinYeuCauHoanTienMoMo,
  truyVanGiaoDichMoMo
} = require('../payment/momo.service.js');
const { taoThanhToanVnpay } = require('../payment/vnpay.service.js');
const {
  taoGiaoDichThanhToan,
  capNhatGiaoDichThanhToan,
  danhDauThatBaiTatCaPendingTheoDonHang,
  danhDauHoanTienMoMoTheoDonHang,
  danhDauThanhCongTheoDonHang
} = require('../payment/payment.service.js');
const { restoreVoucherUsageForUser } = require('../payment/voucher.service.js');
const {
  dongBoYeuCauHoanHangTuDon,
  ghiNhanLichSuTrangThaiDonHang,
  ganThongTinHoanHangChoDon,
  ganThongTinHoanHangChoDanhSachDon
} = require('./order-sidecar.service.js');
const { nhantrangthai, layTrangThaiChoPhep } = require('../../helpers/orderStatus');
const phanTrangHelper = require('../../helpers/pagination');

const THOI_GIAN_CHO_THANH_TOAN_MS = 24 * 60 * 60 * 1000;
const CUA_SO_HOAN_HANG_MS = 7 * 24 * 60 * 60 * 1000;

const LY_DO_HOAN_LABELS = {
  sai_size: 'Sai size',
  loi_san_pham: 'Lỗi sản phẩm',
  khong_giong_mo_ta: 'Không giống mô tả',
  khac: 'Khác'
};

async function dongBoSidecarAnToan(taskName, runner) {
  try {
    await runner();
  } catch (error) {
    console.error(`${taskName} error:`, error);
  }
}

function ganSessionNeuCo(query, session) {
  return session ? query.session(session) : query;
}

function taoSessionOptions(session, extra = {}) {
  return session ? { ...extra, session } : { ...extra };
}

function laLoiMongoKhongHoTroTransaction(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('transaction numbers are only allowed on a replica set member or mongos')
    || (message.includes('transaction') && message.includes('replica set'))
    || (message.includes('transaction') && message.includes('mongos'));
}

async function chayVoiTransactionNeuHoTro(work, label = 'mongo transaction') {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (!laLoiMongoKhongHoTroTransaction(error)) throw error;
    console.warn(`${label} fallback without transaction:`, error.message || error);
    return work(null);
  } finally {
    await session.endSession();
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0));
}

async function hoanLaiVoucherChoDon({ orderDoc, userId, session = null }) {
  const voucherId = orderDoc?.voucher_id;
  if (!voucherId) return;

  await restoreVoucherUsageForUser(
    {
      voucherId,
      userId: userId || orderDoc?.nguoidung_id
    },
    { session }
  );
}

function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
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

function buildRefundSummary(order, items, statusLabels = {}) {
  const orderDoc = order || {};
  const itemRows = Array.isArray(items) ? items : [];
  const currentStatus = String(orderDoc.trangthai || '').trim();
  const returnInfo = orderDoc.yeucauhoanhang || {};

  const requestedRows = Array.isArray(returnInfo.requestedItems) ? returnInfo.requestedItems : [];
  const requestedMap = new Map();
  for (const row of requestedRows) {
    const itemId = String(row && row.orderItemId ? row.orderItemId : '').trim();
    if (!itemId) continue;
    const qty = Math.max(0, toPositiveInt(row.qty, 0));
    if (qty <= 0) continue;
    requestedMap.set(itemId, (requestedMap.get(itemId) || 0) + qty);
  }

  const lines = itemRows.map((raw, index) => {
    const id = String(raw && raw._id ? raw._id : `item-${index}`).trim();
    const boughtQty = Math.max(0, toPositiveInt(raw && raw.soluong, 0));
    const lineByStored = toNumber(raw && raw.thanhtien, 0);
    const unitFallback = toNumber(raw && raw.giaban, 0) > 0
      ? toNumber(raw && raw.giaban, 0)
      : toNumber(raw && raw.giagoc, 0);
    const grossAmount = Math.max(0, roundMoney(lineByStored > 0 ? lineByStored : (unitFallback * boughtQty)));

    return {
      id,
      raw,
      boughtQty,
      grossAmount
    };
  });

  const tongTienHang = Math.max(0, lines.reduce((sum, line) => sum + line.grossAmount, 0));
  const voucherRaw = toNumber(orderDoc.voucher_discount, NaN);
  const voucherDiscount = Math.min(
    tongTienHang,
    Math.max(
      0,
      roundMoney(Number.isFinite(voucherRaw) ? voucherRaw : toNumber(orderDoc.giamgia, 0))
    )
  );
  const shippingFee = Math.max(0, roundMoney(orderDoc.phivanchuyen));
  const originalPayable = Math.max(0, tongTienHang - voucherDiscount + shippingFee);

  const voucherByItem = allocateProportionalAmounts(
    lines.map((line) => ({ id: line.id, amount: line.grossAmount })),
    voucherDiscount
  );

  const isReturnedOrRefunded = new Set([
    'returned',
    'returned_partial',
    'returned_full',
    'refunded'
  ]).has(currentStatus);

  const hasStoredReturned = toPositiveInt(orderDoc.tongsoluong_hoantra, 0) > 0
    || roundMoney(orderDoc.tonggiamdoanhthu_hoantra) > 0;

  const useRequestedAsReturned = isReturnedOrRefunded || hasStoredReturned;

  const perItem = {};
  let returnedQtyTotal = 0;
  let keptQtyTotal = 0;
  let refundAmountComputed = 0;
  let keptGoodsGross = 0;
  let keptVoucherTotal = 0;
  let keptGoodsAfterVoucher = 0;

  const normalizedLines = lines.map((line) => {
    const requestedQty = Math.min(line.boughtQty, Math.max(0, toPositiveInt(requestedMap.get(line.id), 0)));
    const storedReturnedQty = Math.min(line.boughtQty, Math.max(0, toPositiveInt(line.raw.soluonghoan, 0)));

    let returnedQty = storedReturnedQty;
    if (returnedQty <= 0 && useRequestedAsReturned) returnedQty = requestedQty;
    returnedQty = Math.min(line.boughtQty, Math.max(0, returnedQty));

    const keptQty = Math.max(0, line.boughtQty - returnedQty);
    const allocatedVoucher = Math.max(0, roundMoney(voucherByItem[line.id] || 0));
    const lineAfterVoucher = Math.max(0, line.grossAmount - allocatedVoucher);

    const returnedVoucher = splitAmountByQty(allocatedVoucher, line.boughtQty, returnedQty);
    const keptVoucher = Math.max(0, allocatedVoucher - returnedVoucher);

    const refundedAmount = splitAmountByQty(lineAfterVoucher, line.boughtQty, returnedQty);
    const keptAmount = Math.max(0, lineAfterVoucher - refundedAmount);
    const keptGrossAmount = splitAmountByQty(line.grossAmount, line.boughtQty, keptQty);

    returnedQtyTotal += returnedQty;
    keptQtyTotal += keptQty;
    refundAmountComputed += refundedAmount;
    keptGoodsGross += keptGrossAmount;
    keptVoucherTotal += keptVoucher;
    keptGoodsAfterVoucher += keptAmount;

    perItem[line.id] = {
      boughtQty: line.boughtQty,
      returnedQty,
      keptQty,
      refundedAmount,
      keptAmount
    };

    return {
      ...line,
      allocatedVoucher,
      returnedQty,
      keptQty,
      refundedAmount,
      keptAmount
    };
  });

  const refundAmountStored = Math.max(
    0,
    roundMoney(toNumber(orderDoc.tonggiamdoanhthu_hoantra, 0) || toNumber(returnInfo.refundAmount, 0))
  );
  const refundAmount = Math.min(
    originalPayable,
    Math.max(0, refundAmountComputed > 0 ? refundAmountComputed : refundAmountStored)
  );
  const remainingPayable = Math.max(0, originalPayable - refundAmount);
  const remainingGoodsAfterRefund = Math.max(0, remainingPayable - shippingFee);

  const hasReturnFlow = requestedRows.length > 0
    || refundAmount > 0
    || returnedQtyTotal > 0
    || new Set([
      'requested_return',
      'approved_return',
      'rejected_return',
      'return_shipping',
      'returned',
      'returned_partial',
      'returned_full',
      'refunded'
    ]).has(currentStatus);

  const approvedDone = Boolean(returnInfo.approvedAt)
    || new Set(['approved_return', 'return_shipping', 'returned', 'returned_partial', 'returned_full', 'refunded']).has(currentStatus);
  const receivedDone = Boolean(returnInfo.returnedAt)
    || new Set(['returned', 'returned_partial', 'returned_full', 'refunded']).has(currentStatus);
  const refundedDone = Boolean(returnInfo.refundedAt) || currentStatus === 'refunded';

  return {
    hasReturnFlow,
    perItem,
    original: {
      goodsSubtotal: tongTienHang,
      voucherDiscount,
      shippingFee,
      payable: originalPayable
    },
    refund: {
      totalReturnedQty: returnedQtyTotal,
      amount: refundAmount,
      requestedItems: requestedRows
        .map((row) => {
          const itemId = String(row && row.orderItemId ? row.orderItemId : '').trim();
          const boughtQty = Math.max(0, toPositiveInt(row && row.boughtQty, 0));
          const qty = Math.max(0, toPositiveInt(row && row.qty, 0));
          if (!itemId || qty <= 0) return null;
          return {
            itemId,
            name: String(row && row.tensanpham ? row.tensanpham : 'San pham'),
            image: normalizeImage(row && row.hinhanh ? row.hinhanh : ''),
            color: String(row && row.mausac ? row.mausac : ''),
            size: String(row && row.kichco ? row.kichco : ''),
            requestedQty: qty,
            boughtQty
          };
        })
        .filter(Boolean),
      items: normalizedLines
        .filter((line) => line.returnedQty > 0)
        .map((line) => ({
          itemId: line.id,
          name: String(line.raw.tensanpham || 'San pham'),
          image: normalizeImage(line.raw.hinhanh),
          color: String(line.raw.mausac || ''),
          size: String(line.raw.kichco || ''),
          returnedQty: line.returnedQty,
          boughtQty: line.boughtQty,
          amount: line.refundedAmount
        })),
      statusLabel: statusLabels[currentStatus] || currentStatus || '-',
      progress: {
        approved: approvedDone,
        received: receivedDone,
        refunded: refundedDone
      },
      timeline: {
        approvedAt: returnInfo.approvedAt || null,
        returnedAt: returnInfo.returnedAt || null,
        refundedAt: returnInfo.refundedAt || null
      }
    },
    remaining: {
      keptQtyTotal,
      goodsValue: keptGoodsGross,
      voucherAllocated: keptVoucherTotal,
      goodsAfterVoucher: Math.min(keptGoodsAfterVoucher, remainingGoodsAfterRefund),
      payable: remainingPayable,
      items: normalizedLines
        .filter((line) => line.keptQty > 0)
        .map((line) => ({
          itemId: line.id,
          name: String(line.raw.tensanpham || 'San pham'),
          image: normalizeImage(line.raw.hinhanh),
          color: String(line.raw.mausac || ''),
          size: String(line.raw.kichco || ''),
          keptQty: line.keptQty,
          boughtQty: line.boughtQty,
          amount: line.keptAmount
        }))
    }
  };
}

function layMocDaGiao(order) {
  if (!order) return null;
  return order.ngaygiaohang || order.ngaycapnhat || order.ngaytao || null;
}

function coTheYeuCauHoan(order) {
  if (!order) return false;
  if (String(order.trangthai || '') !== 'dagiao') return false;
  if (order && order.yeucauhoanhang && order.yeucauhoanhang.requestedAt) return false;
  const moc = layMocDaGiao(order);
  if (!moc) return false;
  const delta = Date.now() - new Date(moc).getTime();
  return Number.isFinite(delta) && delta >= 0 && delta <= CUA_SO_HOAN_HANG_MS;
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
      orderItemId: String(it && (it.orderItemId || it._id) ? (it.orderItemId || it._id) : '').trim(),
      qty: Math.max(0, parseInt(it && it.qty ? it.qty : 0, 10) || 0)
    }))
    .filter((it) => mongoose.Types.ObjectId.isValid(it.orderItemId) && it.qty >= 0);
}

function normalizeTextField(raw, maxLength = 120) {
  return String(raw || '').trim().slice(0, maxLength);
}

function normalizeAccountNumber(raw) {
  return String(raw || '')
    .replace(/\s+/g, '')
    .replace(/[^\d]/g, '')
    .slice(0, 30);
}

function laDonChoThanhToanOnline(don) {
  return don
    && String(don.trangthai || '') === 'choxacnhan'
    && !don.dathanhtoan
    && (String(don.phuongthucthanhtoan || '') === 'momo' || String(don.phuongthucthanhtoan || '') === 'vnpay');
}

function tinhHanThanhToanMs(don) {
  if (!don || !don.ngaytao) return null;
  const t = new Date(don.ngaytao).getTime();
  if (!Number.isFinite(t)) return null;
  return t + THOI_GIAN_CHO_THANH_TOAN_MS;
}

async function congTonChoChiTietDon(orderitemdoc, session = null) {
  const productid = orderitemdoc.sanpham_id;
  const variantid = orderitemdoc.bienthe_id;
  const size = orderitemdoc.kichco;
  const qty = Math.max(1, parseInt(orderitemdoc.soluong, 10) || 1);

  let productQuery = sanpham.findById(productid);
  if (session) productQuery = productQuery.session(session);
  const product = await productQuery;
  if (!product) throw new Error('San pham khong ton tai');

  const basetotal = (typeof product.soluongton === 'number') ? product.soluongton : tinhTongTon(product);
  const hassize = !laLoaiKhongSize(product.loaisanpham);

  if (!variantid) {
    if (hassize) {
      product.sizes = product.sizes || [];
      let row = (product.sizes || []).find((s) => s.size === size);
      if (!row) {
        product.sizes.push({ size, soluong: qty });
      } else {
        row.soluong = Number(row.soluong || 0) + qty;
      }
    } else {
      product.soluong_chinh = Number(product.soluong_chinh || 0) + qty;
    }
  } else {
    const v = (product.bienthe || []).id(variantid);
    if (!v) throw new Error('Bien the khong ton tai');

    if (hassize) {
      v.sizes = v.sizes || [];
      let row = (v.sizes || []).find((s) => s.size === size);
      if (!row) {
        v.sizes.push({ size, soluong: qty });
      } else {
        row.soluong = Number(row.soluong || 0) + qty;
      }
    } else {
      v.soluong = Number(v.soluong || 0) + qty;
    }
  }

  product.soluongton = basetotal + qty;
  await product.save(session ? { session } : undefined);

  const fifoAllocations = Array.isArray(orderitemdoc?.fifoAllocations) ? orderitemdoc.fifoAllocations : [];
  for (const alloc of fifoAllocations) {
    const lotId = String(alloc?.lotId || '').trim();
    const soLuong = Math.max(0, Number(alloc?.soLuong || 0));
    if (!lotId || !mongoose.Types.ObjectId.isValid(lotId) || soLuong <= 0) continue;

    await InventoryLot.updateOne(
      { _id: new mongoose.Types.ObjectId(lotId) },
      {
        $inc: { soluongconlai: soLuong },
        $set: { ngaycapnhat: new Date() }
      },
      session ? { session } : undefined
    );
  }
}

async function huyDonKhachHangTrongTransaction({ userId, orderId, lydo }) {
  let donhangdoc = null;

  donhangdoc = await chayVoiTransactionNeuHoTro(async (session) => {
    const currentOrder = await ganSessionNeuCo(donhang.findOne({
      _id: orderId,
      nguoidung_id: userId,
      daxoa: { $ne: true },
      trangthai: 'choxacnhan'
    }), session);

    if (!currentOrder) return null;

    currentOrder.trangthai = 'dahuy';
    currentOrder.lydohuy = lydo;
    currentOrder.ngaycapnhat = new Date();
    await currentOrder.save(taoSessionOptions(session));

    const danhsachitem = await ganSessionNeuCo(chitietdonhang.find({ donhang_id: currentOrder._id }), session);
    for (const it of (danhsachitem || [])) {
      await congTonChoChiTietDon(it, session);
    }

    await chitietdonhang.updateMany(
      { donhang_id: currentOrder._id },
      { $set: { trangthai: 'dahuy' } },
      taoSessionOptions(session)
    );

    await hoanLaiVoucherChoDon({ orderDoc: currentOrder, userId, session });

    return currentOrder;
  }, 'client cancel order transaction');

  return donhangdoc;
}

async function tuDongHuyDonQuaHan(userId) {
  const cutoff = new Date(Date.now() - THOI_GIAN_CHO_THANH_TOAN_MS);
  const danhsach = await donhang.find({
    nguoidung_id: userId,
    daxoa: { $ne: true },
    trangthai: 'choxacnhan',
    dathanhtoan: false,
    phuongthucthanhtoan: { $in: ['momo', 'vnpay'] },
    ngaytao: { $lt: cutoff }
  }).select('_id').limit(30).lean();

  for (const row of (danhsach || [])) {
    const updated = await donhang.findOneAndUpdate(
      { _id: row._id, trangthai: 'choxacnhan', dathanhtoan: false, daxoa: { $ne: true } },
      { $set: { trangthai: 'dahuy', lydohuy: 'Hết hạn thanh toán (24h)', ngaycapnhat: new Date() } },
      { new: false }
    );

    if (!updated) continue;

    try {
      await chitietdonhang.updateMany(
        { donhang_id: updated._id },
        { $set: { trangthai: 'dahuy' } }
      );
    } catch {
      // best-effort
    }

    try {
      await danhDauThatBaiTatCaPendingTheoDonHang({
        donhangId: updated._id,
        response: { autoCancel: true, reason: 'Hết hạn thanh toán (24h)' },
        ghichu: 'Đơn bị hủy do quá hạn thanh toán'
      });
    } catch {
      // best-effort
    }

    const danhsachitem = await chitietdonhang.find({ donhang_id: row._id });
    for (const it of (danhsachitem || [])) {
      try {
        await congTonChoChiTietDon(it);
      } catch {
        // best-effort
      }
    }

    try {
      await hoanLaiVoucherChoDon({ orderDoc: updated, userId: updated.nguoidung_id });
    } catch (error) {
      console.error('auto cancel restore voucher error:', error);
    }
  }
}

async function getOrdersPageData({ userId, query }) {
  await tuDongHuyDonQuaHan(userId);

  const trangthai = String(query.status || 'all');
  const tapchophep = new Set(layTrangThaiChoPhep());
  const trangthaihientai = tapchophep.has(trangthai) ? trangthai : 'all';

  const boloc = { nguoidung_id: userId, daxoa: { $ne: true } };
  if (trangthaihientai !== 'all') boloc.trangthai = trangthaihientai;

  const tongDon = await donhang.countDocuments(boloc);
  let phanTrang = { currentPage: 1, limit: 10 };
  phanTrang = phanTrangHelper(phanTrang, query, tongDon);

  const danhsachdon = await donhang.find(boloc)
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .skip(phanTrang.skip)
    .limit(phanTrang.limit)
    .lean();
  await ganThongTinHoanHangChoDanhSachDon(danhsachdon);

  const nowMs = Date.now();
  for (const o of (danhsachdon || [])) {
    if (!laDonChoThanhToanOnline(o)) continue;
    const deadline = tinhHanThanhToanMs(o);
    if (!deadline) continue;
    o.paymentDeadline = deadline;
    o.paymentRemainingMs = Math.max(0, deadline - nowMs);
  }

  if (danhsachdon && danhsachdon.length) {
    const danhsachiddon = danhsachdon.map(o => o._id);
    const reviewed = await danhgia.find({
      nguoidung_id: userId,
      donhang_id: { $in: danhsachiddon },
      daxoa: { $ne: true }
    }).select('_id chitietdonhang_id').lean();
    const reviewedMap = new Map((reviewed || []).map((r) => [String(r.chitietdonhang_id), String(r._id)]));

    const danhsachchitiet = await chitietdonhang.find({ donhang_id: { $in: danhsachiddon } })
      .select('_id donhang_id tensanpham hinhanh sanpham_id')
      .sort({ ngaytao: 1 })
      .lean();

    const mapdon = new Map();
    for (const it of (danhsachchitiet || [])) {
      const key = String(it.donhang_id);
      const tontai = mapdon.get(key);
      if (!tontai) {
        mapdon.set(key, { first: it, count: 1 });
      } else {
        tontai.count += 1;
      }
    }

    for (const don of danhsachdon) {
      const thongtin = mapdon.get(String(don._id));
      if (!thongtin) {
        don.preview = null;
        continue;
      }
      don.preview = {
        name: thongtin.first && thongtin.first.tensanpham ? String(thongtin.first.tensanpham) : 'Sản phẩm',
        image: normalizeImage(thongtin.first && thongtin.first.hinhanh ? String(thongtin.first.hinhanh) : ''),
        count: thongtin.count || 1,
        itemId: thongtin.first ? String(thongtin.first._id) : null,
        productId: thongtin.first && thongtin.first.sanpham_id ? String(thongtin.first.sanpham_id) : null,
        reviewed: thongtin.first ? reviewedMap.has(String(thongtin.first._id)) : false,
        reviewId: thongtin.first && reviewedMap.has(String(thongtin.first._id))
          ? reviewedMap.get(String(thongtin.first._id))
          : null
      };
    }
  }

  return {
    orders: danhsachdon || [],
    currentStatus: trangthaihientai,
    statusOptions: layTrangThaiChoPhep(),
    statusLabels: nhantrangthai,
    pagination: phanTrang
  };
}

async function getOrderDetailPageData({ userId, orderId, paidFlag }) {
  if (String(paidFlag || '') === '1') {
    return { redirect: `/orders/${orderId}`, flash: { type: 'success', message: 'Thanh toán thành công!' } };
  }

  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) {
    return {
      notFound: true,
      titlePage: 'Không tìm thấy đơn hàng',
      order: null,
      items: [],
      statusLabels: nhantrangthai
    };
  }
  await ganThongTinHoanHangChoDon(donhangdoc);

  let cancelInfo = null;
  if (String(donhangdoc.trangthai || '') === 'dahuy') {
    const cancelLog = await OrderStatusLog.findOne({
      donhang_id: donhangdoc._id,
      trangthai_moi: 'dahuy'
    })
      .sort({ ngaytao: -1 })
      .select('hanhdong actorRole actorName ghichu ngaytao')
      .lean();

    const cancelReason = String(donhangdoc.lydohuy || cancelLog?.ghichu || '').trim();
    const cancelAction = String(cancelLog?.hanhdong || '').trim();
    const fallbackSellerCancel = !cancelAction
      && Boolean(cancelReason)
      && cancelReason !== 'Khach hang huy don'
      && cancelReason !== 'Hết hạn thanh toán (24h)';
    cancelInfo = {
      reason: cancelReason,
      canceledAt: cancelLog?.ngaytao || null,
      actorName: String(cancelLog?.actorName || '').trim(),
      actorRole: String(cancelLog?.actorRole || '').trim(),
      canceledBySeller: cancelAction === 'admin_canceled_order' || fallbackSellerCancel,
      canceledByUser: cancelAction === 'user_canceled_order'
    };
  }

  if (laDonChoThanhToanOnline(donhangdoc)) {
    const deadline = tinhHanThanhToanMs(donhangdoc);
    if (deadline && Date.now() > deadline) {
      await tuDongHuyDonQuaHan(userId);
      return { redirect: `/orders/${orderId}` };
    }
    donhangdoc.paymentDeadline = deadline;
    donhangdoc.paymentRemainingMs = deadline ? Math.max(0, deadline - Date.now()) : null;
  }

  const danhsachitem = await chitietdonhang.find({ donhang_id: donhangdoc._id }).lean();
  const reviewed = await danhgia.find({
    nguoidung_id: userId,
    donhang_id: donhangdoc._id,
    daxoa: { $ne: true }
  }).select('_id chitietdonhang_id').lean();
  const reviewMap = new Map((reviewed || []).map(r => [String(r.chitietdonhang_id), r]));

  const danhsachdaxuly = (danhsachitem || []).map((it) => ({
    ...it,
    hinhanh: normalizeImage(it.hinhanh),
    daDanhGia: reviewMap.has(String(it._id)),
    reviewId: reviewMap.get(String(it._id)) ? String(reviewMap.get(String(it._id))._id) : null
  }));
  const refundSummary = buildRefundSummary(donhangdoc, danhsachdaxuly, nhantrangthai);

  return {
    titlePage: `Chi tiết ${donhangdoc.madonhang || 'đơn hàng'}`,
    order: donhangdoc,
    items: danhsachdaxuly,
    cancelInfo,
    refundSummary,
    statusLabels: nhantrangthai,
    returnEligible: coTheYeuCauHoan(donhangdoc),
    returnReasonLabels: LY_DO_HOAN_LABELS
  };
}

async function createReturnRequest({ userId, orderId, body, files }) {
  const order = await donhang.findOne({
    _id: orderId,
    nguoidung_id: userId,
    daxoa: { $ne: true }
  });

  if (!order) {
    return { ok: false, redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };
  }
  await ganThongTinHoanHangChoDon(order);

  if (!coTheYeuCauHoan(order)) {
    return {
      ok: false,
      redirect: `/orders/${order._id}`,
      flash: { type: 'error', message: 'Đơn hàng này không đủ điều kiện gửi yêu cầu hoàn hàng.' }
    };
  }

  const reason = String(body.reason || '').trim();
  const detail = String(body.detail || '').trim();
  const paymentMethod = String(order.phuongthucthanhtoan || 'cod').trim().toLowerCase();
  const requestedRefundMethod = String(body.refundMethod || '').trim().toLowerCase();
  const isOnlineWalletPayment = paymentMethod === 'momo' || paymentMethod === 'vnpay';

  let refundMethod = requestedRefundMethod;
  let refundWallet = '';

  if (!LY_DO_HOAN_LABELS[reason]) {
    return { ok: false, redirect: `/orders/${order._id}`, flash: { type: 'error', message: 'Lý do hoàn hàng không hợp lệ.' } };
  }

  if (isOnlineWalletPayment) {
    if (!['wallet', 'bank', 'momo', 'vnpay'].includes(refundMethod)) {
      return { ok: false, redirect: `/orders/${order._id}`, flash: { type: 'error', message: 'Phương thức hoàn tiền không hợp lệ.' } };
    }

    if (refundMethod === 'wallet' || refundMethod === 'momo' || refundMethod === 'vnpay') {
      refundMethod = 'wallet';
      refundWallet = paymentMethod;
    }
  } else {
    if (refundMethod && refundMethod !== 'bank') {
      return {
        ok: false,
        redirect: `/orders/${order._id}`,
        flash: { type: 'error', message: 'Đơn COD chỉ hỗ trợ hoàn tiền qua chuyển khoản ngân hàng.' }
      };
    }
    refundMethod = 'bank';
  }

  const refundBankName = normalizeTextField(body.bankName, 120);
  const refundBankAccountName = normalizeTextField(body.bankAccountName, 120);
  const refundBankAccountNumber = normalizeAccountNumber(body.bankAccountNumber);

  if (refundMethod === 'bank') {
    if (!refundBankName || !refundBankAccountName || !refundBankAccountNumber) {
      return {
        ok: false,
        redirect: `/orders/${order._id}`,
        flash: { type: 'error', message: 'Vui lòng nhập đầy đủ tên ngân hàng, tên người nhận và số tài khoản để hoàn tiền.' }
      };
    }

    if (refundBankAccountNumber.length < 6) {
      return {
        ok: false,
        redirect: `/orders/${order._id}`,
        flash: { type: 'error', message: 'Số tài khoản không hợp lệ.' }
      };
    }
  }

  const orderItems = await chitietdonhang.find({ donhang_id: order._id })
    .select('_id tensanpham soluong kichco mausac hinhanh')
    .lean();
  const orderItemMap = new Map((orderItems || []).map((it) => [String(it._id), it]));

  const requestedRows = normalizeReturnItemsPayload(body && body.returnItems);
  const requestedItems = [];

  for (const row of requestedRows) {
    const orderItem = orderItemMap.get(String(row.orderItemId));
    if (!orderItem) continue;
    const boughtQty = Math.max(0, parseInt(orderItem.soluong || 0, 10) || 0);
    const qty = Math.max(0, Math.min(boughtQty, parseInt(row.qty || 0, 10) || 0));
    if (qty <= 0) continue;

    requestedItems.push({
      orderItemId: String(orderItem._id),
      qty,
      boughtQty,
      tensanpham: String(orderItem.tensanpham || ''),
      hinhanh: normalizeImage(String(orderItem.hinhanh || '')),
      kichco: String(orderItem.kichco || ''),
      mausac: String(orderItem.mausac || '')
    });
  }

  if (!requestedItems.length) {
    return {
      ok: false,
      redirect: `/orders/${order._id}`,
      flash: { type: 'error', message: 'Vui lòng chọn ít nhất 1 sản phẩm và số lượng muốn hoàn.' }
    };
  }

  const proofMedias = Array.isArray(files)
    ? files.filter((f) => f && f.filename).map((f) => `/uploads/returns/${f.filename}`)
    : [];
  const proofMedia = proofMedias.length ? proofMedias[0] : '';

  const previousStatus = String(order.trangthai || '');
  order.trangthai = 'requested_return';
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    requestedAt: new Date(),
    reason,
    reasonLabel: LY_DO_HOAN_LABELS[reason],
    detail: detail || '',
    requestedItems,
    proofMedias,
    proofMedia,
    proofImage: proofMedia,
    refundMethod,
    refundWallet: refundWallet || undefined,
    refundBankName: refundMethod === 'bank' ? refundBankName : '',
    refundBankAccountName: refundMethod === 'bank' ? refundBankAccountName : '',
    refundBankAccountNumber: refundMethod === 'bank' ? refundBankAccountNumber : '',
    adminNote: '',
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: null,
    returnedAt: null,
    refundedAt: null
  };
  order.ngaycapnhat = new Date();
  await order.save();
  await dongBoSidecarAnToan('order refund sidecar sync', async () => {
    const actor = { _id: userId, vaitro: 'user' };
    await dongBoYeuCauHoanHangTuDon({
      order,
      action: 'user_requested_return',
      actor
    });
    await ghiNhanLichSuTrangThaiDonHang({
      order,
      previousStatus,
      nextStatus: String(order.trangthai || ''),
      action: 'user_requested_return',
      actor,
      note: detail || '',
      metadata: {
        requestedItemsCount: requestedItems.length,
        refundMethod
      }
    });
  });

  return { ok: true, redirect: `/orders/${order._id}`, flash: { type: 'success', message: 'Đã gửi yêu cầu hoàn hàng. Vui lòng chờ admin duyệt.' } };
}

async function cancelReturnRequestByUser({ userId, orderId }) {
  const order = await donhang.findOne({
    _id: orderId,
    nguoidung_id: userId,
    daxoa: { $ne: true }
  });

  if (!order) {
    return { ok: false, redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };
  }
  await ganThongTinHoanHangChoDon(order);

  if (String(order.trangthai || '') !== 'requested_return') {
    return {
      ok: false,
      redirect: `/orders/${order._id}`,
      flash: { type: 'error', message: 'Yêu cầu hoàn hàng không còn ở trạng thái chờ xử lý để hủy.' }
    };
  }

  const daDuocAdminXuLy = Boolean(order.yeucauhoanhang && (order.yeucauhoanhang.reviewedAt || order.yeucauhoanhang.approvedAt || order.yeucauhoanhang.rejectedAt));
  if (daDuocAdminXuLy) {
    return {
      ok: false,
      redirect: `/orders/${order._id}`,
      flash: { type: 'error', message: 'Yêu cầu hoàn hàng đã được admin xử lý nên không thể hủy.' }
    };
  }

  const previousStatus = String(order.trangthai || '');
  order.trangthai = 'dagiao';
  order.ngaycapnhat = new Date();
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    requestedAt: null,
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: null,
    canceledByUserAt: new Date(),
    canceledByUser: true,
    adminNote: ''
  };
  await order.save();
  await dongBoSidecarAnToan('order refund cancel sidecar sync', async () => {
    const actor = { _id: userId, vaitro: 'user' };
    await dongBoYeuCauHoanHangTuDon({
      order,
      action: 'user_canceled_return_request',
      actor
    });
    await ghiNhanLichSuTrangThaiDonHang({
      order,
      previousStatus,
      nextStatus: String(order.trangthai || ''),
      action: 'user_canceled_return_request',
      actor,
      metadata: { canceledByUser: true }
    });
  });

  return {
    ok: true,
    redirect: `/orders/${order._id}`,
    flash: { type: 'success', message: 'Đã hủy yêu cầu hoàn hàng.' }
  };
}

async function cancelOrderByUser({ userId, orderId, reason }) {
  const lydo = String(reason || '').trim() || 'Khach hang huy don';
  const previousStatus = 'choxacnhan';

  const donhangdoc = await huyDonKhachHangTrongTransaction({ userId, orderId, lydo });

  if (!donhangdoc) {
    const tontai = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } })
      .select('_id trangthai')
      .lean();

    if (!tontai) return { ok: false, redirect: '/orders', flash: { type: 'error', message: 'Khong tim thay don hang.' } };
    return { ok: false, redirect: "/orders/" + tontai._id, flash: { type: 'error', message: 'Don hang nay khong the huy o trang thai hien tai.' } };
  }

  await dongBoSidecarAnToan('order cancel status log', async () => {
    await ghiNhanLichSuTrangThaiDonHang({
      order: donhangdoc,
      previousStatus,
      nextStatus: String(donhangdoc.trangthai || ''),
      action: 'user_canceled_order',
      actor: { _id: userId, vaitro: 'user' },
      note: lydo
    });
  });

  if (!donhangdoc.dathanhtoan) {
    try {
      await danhDauThatBaiTatCaPendingTheoDonHang({
        donhangId: donhangdoc._id,
        response: { cancel: true, reason: lydo },
        ghichu: 'Huy don truoc khi thanh toan'
      });
    } catch {
      // best-effort
    }
  }

  if (donhangdoc.phuongthucthanhtoan === 'momo' && donhangdoc.dathanhtoan && donhangdoc.momoTransId && !donhangdoc.momoRefunded) {
    try {
      const refundRefs = taoThongTinYeuCauHoanTienMoMo(String(donhangdoc._id));
      const ketqua = await taoHoanTienMoMo({
        orderId: refundRefs.orderId,
        requestId: refundRefs.requestId,
        amount: Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0)),
        transId: Number(donhangdoc.momoTransId),
        description: 'Hoan tien don hang ' + (donhangdoc.madonhang || String(donhangdoc._id))
      });

      if (ketqua && (ketqua.resultCode === 0 || ketqua.message === 'Success')) {
        await donhang.updateOne({ _id: donhangdoc._id }, { $set: { momoRefunded: true, momoRefundAt: new Date() } });

        try {
          await danhDauHoanTienMoMoTheoDonHang({
            donhangId: donhangdoc._id,
            nguoidungId: donhangdoc.nguoidung_id,
            sotien: Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0)),
            magiaodich: donhangdoc.momoOrderId || undefined,
            refundResponse: ketqua,
            ghichu: 'Hoàn tiền MoMo thành công'
          });
        } catch {
          // best-effort
        }

        return { ok: true, redirect: '/orders', flash: { type: 'success', message: 'Đã hủy đơn hàng, hoàn tiền MoMo thành công.' } };
      }

      return { ok: false, redirect: "/orders/" + donhangdoc._id, flash: { type: 'error', message: ketqua?.message || 'Đã hủy đơn nhưng hoàn tiền MoMo thất bại.' } };
    } catch {
      return { ok: false, redirect: "/orders/" + donhangdoc._id, flash: { type: 'error', message: 'Đã hủy đơn nhưng hoàn tiền MoMo lỗi.' } };
    }
  }

  return { ok: true, redirect: '/orders', flash: { type: 'success', message: 'Đã hủy đơn hàng và hoàn lại số lượng sản phẩm.' } };
}

async function reorderFromOldOrder({ userId, orderId }) {
  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) return { redirect: '/orders', flash: { type: 'success', message: 'Không tìm thấy đơn hàng.' } };

  const danhsachitem = await chitietdonhang.find({ donhang_id: donhangdoc._id }).lean();
  if (!danhsachitem || !danhsachitem.length) return { redirect: '/orders', flash: { type: 'success', message: 'Đơn hàng không có sản phẩm để mua lại.' } };

  const giohang = await getOrCreateCart(userId);
  let sodathem = 0;
  let soboqua = 0;

  for (const it of danhsachitem) {
    const sanphamdoc = await sanpham.findOne({ _id: it.sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' }).lean();
    if (!sanphamdoc) {
      soboqua += 1;
      continue;
    }

    const bientheid = it.bienthe_id ? String(it.bienthe_id) : '';
    const sizeval = it.kichco ? String(it.kichco) : '';

    const tontai = (giohang.sanpham || []).find(ci => String(ci.sanpham_id) === String(it.sanpham_id)
      && String(ci.bienthe_id || '') === bientheid
      && String(ci.kichco || '') === sizeval);

    const qty = Math.max(1, parseInt(it.soluong, 10) || 1);

    if (tontai) {
      tontai.soluong = (tontai.soluong || 0) + qty;
    } else {
      giohang.sanpham.push({
        sanpham_id: it.sanpham_id,
        bienthe_id: it.bienthe_id || null,
        tensanpham: it.tensanpham || sanphamdoc.tensanpham,
        hinhanh: normalizeImage(it.hinhanh) || normalizeImage(sanphamdoc.hinhanh),
        mausac: it.mausac || sanphamdoc.mausac_chinh || 'Mặc định',
        kichco: it.kichco || null,
        gia: it.giagoc || it.giaban || sanphamdoc.gia || 0,
        giagiam: it.giaban || it.giagoc || sanphamdoc.gia || 0,
        soluong: qty
      });
    }

    sodathem += 1;
  }

  await giohang.save();
  return {
    redirect: '/cart',
    flash: {
      type: 'success',
      message: `Đã thêm ${sodathem} sản phẩm vào giỏ hàng${soboqua ? ` (bỏ qua ${soboqua} sản phẩm đã ngừng bán)` : ''}.`
    }
  };
}

async function repayOrder({ userId, orderId, protocol, host, headers, socketRemoteAddress, ip }) {
  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) return { redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };

  const dangcho = donhangdoc.trangthai === 'choxacnhan';
  const chuathanhtoan = !donhangdoc.dathanhtoan;
  const phuongthuc = String(donhangdoc.phuongthucthanhtoan || 'cod');

  if (!dangcho || !chuathanhtoan || (phuongthuc !== 'momo' && phuongthuc !== 'vnpay')) {
    return { redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: 'Đơn hàng không thể thanh toán lại.' } };
  }

  const tongtien = Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0));

  if (phuongthuc === 'momo') {
    const redirectUrl = String(process.env.MOMO_REDIRECT_URL || `${protocol}://${host}/cart/momo/return`);
    const ipnUrl = String(process.env.MOMO_IPN_URL || `${protocol}://${host}/cart/momo/ipn`);
    const orderInfo = `Thanh toan don hang ${donhangdoc.madonhang || String(donhangdoc._id)}`;
    const maMoMo = `${donhangdoc._id}-${Date.now()}`;
    const extraData = Buffer.from(JSON.stringify({ orderId: String(donhangdoc._id) })).toString('base64');

    const ketqua = await taoThanhToanMoMo({
      orderId: maMoMo,
      requestId: maMoMo,
      amount: String(tongtien),
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData
    });

    await donhang.updateOne(
      { _id: donhangdoc._id },
      { $set: { momoOrderId: maMoMo, momoRequestId: maMoMo, momoPayUrl: ketqua?.payUrl || undefined, ngaycapnhat: new Date() } }
    );

    try {
      await taoGiaoDichThanhToan({
        donhangId: donhangdoc._id,
        nguoidungId: donhangdoc.nguoidung_id,
        phuongthuc: 'momo',
        sotien: tongtien,
        magiaodich: maMoMo,
        trangthai: ketqua?.payUrl ? 'choduyet' : 'thatbai',
        response: ketqua,
        ghichu: ketqua?.payUrl ? 'Thanh toán lại MoMo' : (ketqua?.message || 'Không thể tạo thanh toán MoMo')
      });
    } catch {
      // best-effort
    }

    if (ketqua && ketqua.payUrl) return { redirect: ketqua.payUrl };
    return { redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: ketqua?.message || 'Không thể tạo thanh toán MoMo' } };
  }

  const returnUrl = String(process.env.VNPAY_RETURN_URL || `${protocol}://${host}/cart/vnpay/return`);
  const ipnUrl = String(process.env.VNPAY_IPN_URL || `${protocol}://${host}/cart/vnpay/ipn`);
  const now = new Date();
  const txnRef = `${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
  const orderInfo = `Thanh toan cho ma GD:${txnRef}`;
  const ipAddr = String(headers['x-forwarded-for'] || socketRemoteAddress || ip || '127.0.0.1').split(',')[0].trim();

  await donhang.updateOne({ _id: donhangdoc._id }, { $set: { vnpayTxnRef: txnRef } });

  const payUrl = taoThanhToanVnpay({
    orderId: txnRef,
    amount: tongtien,
    orderInfo,
    returnUrl,
    ipnUrl,
    ipAddr,
    locale: 'vn',
    orderType: 'other'
  });

  try {
    await taoGiaoDichThanhToan({
      donhangId: donhangdoc._id,
      nguoidungId: donhangdoc.nguoidung_id,
      phuongthuc: 'vnpay',
      sotien: tongtien,
      magiaodich: txnRef,
      trangthai: 'choduyet',
      response: { txnRef, payUrl },
      ghichu: 'Thanh toán lại VNPAY'
    });
  } catch {
    // best-effort
  }

  return { redirect: payUrl };
}

async function checkOrderPaymentStatus({ userId, orderId }) {
  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } })
    .select('_id nguoidung_id madonhang trangthai tongtien tamtinh dathanhtoan phuongthucthanhtoan momoOrderId momoRequestId momoTransId')
    .lean();

  if (!donhangdoc) return { status: 404, payload: { success: false, message: 'Không tìm thấy đơn hàng' } };
  if (donhangdoc.dathanhtoan) return { status: 200, payload: { success: true, paid: true } };

  const method = String(donhangdoc.phuongthucthanhtoan || '');
  if (method !== 'momo') return { status: 200, payload: { success: true, paid: false } };

  const momoOrderId = String(donhangdoc.momoOrderId || '').trim();
  const momoRequestId = String(donhangdoc.momoRequestId || momoOrderId || '').trim();
  if (!momoOrderId) return { status: 200, payload: { success: true, paid: false } };

  const ketqua = await truyVanGiaoDichMoMo({ orderId: momoOrderId, requestId: momoRequestId });
  const resultCode = Number(ketqua?.resultCode ?? -1);
  const transId = ketqua?.transId ? String(ketqua.transId) : '';

  if (resultCode === 0) {
    await donhang.updateOne(
      { _id: donhangdoc._id },
      { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), momoTransId: transId || undefined, ngaycapnhat: new Date() } }
    );

    try {
      await danhDauThanhCongTheoDonHang({
        donhangId: donhangdoc._id,
        nguoidungId: donhangdoc.nguoidung_id,
        phuongthuc: 'momo',
        sotien: Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0)),
        magiaodich: momoOrderId || undefined,
        successResponse: ketqua,
        ghichu: 'Polling MoMo: success'
      });
    } catch {
      // best-effort
    }

    return { status: 200, payload: { success: true, paid: true } };
  }

  try {
    await capNhatGiaoDichThanhToan({
      donhangId: donhangdoc._id,
      nguoidungId: donhangdoc.nguoidung_id,
      phuongthuc: 'momo',
      sotien: Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0)),
      magiaodich: momoOrderId || undefined,
      trangthai: 'choduyet',
      response: ketqua,
      ghichu: `Polling MoMo: resultCode=${resultCode}`
    });
  } catch {
    // best-effort
  }

  return { status: 200, payload: { success: true, paid: false, resultCode, message: ketqua?.message || '' } };
}

async function changePaymentMethod({ userId, orderId, newMethod }) {
  const phuongthucMoi = String(newMethod || '').trim();
  const hopLe = ['cod', 'momo'];
  if (!hopLe.includes(phuongthucMoi)) return { ok: false, redirect: `/orders/${orderId}`, flash: { type: 'error', message: 'Phương thức thanh toán không hợp lệ.' } };

  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } });
  if (!donhangdoc) return { ok: false, redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };

  if (donhangdoc.trangthai !== 'choxacnhan' || donhangdoc.dathanhtoan) {
    return { ok: false, redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: 'Đơn hàng không thể đổi phương thức thanh toán.' } };
  }

  if (String(donhangdoc.phuongthucthanhtoan || 'cod') === phuongthucMoi) {
    return { ok: true, redirect: `/orders/${donhangdoc._id}`, flash: { type: 'success', message: 'Phương thức thanh toán không thay đổi.' } };
  }

  const capnhat = {
    phuongthucthanhtoan: phuongthucMoi,
    vnpayTxnRef: undefined,
    vnpayTransId: undefined,
    vnpayBankCode: undefined,
    momoTransId: undefined
  };

  await donhang.updateOne({ _id: donhangdoc._id }, { $set: capnhat });
  return { ok: true, redirect: `/orders/${donhangdoc._id}`, flash: { type: 'success', message: 'Đã cập nhật phương thức thanh toán.' } };
}

module.exports = {
  getOrdersPageData,
  getOrderDetailPageData,
  createReturnRequest,
  cancelReturnRequestByUser,
  cancelOrderByUser,
  reorderFromOldOrder,
  repayOrder,
  checkOrderPaymentStatus,
  changePaymentMethod
};
