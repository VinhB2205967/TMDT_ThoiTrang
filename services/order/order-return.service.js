const mongoose = require('mongoose');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const TonKhoLo = require('../../models/inventory_lot_model');
const { laLoaiKhongSize, tinhTongTon } = require('../catalog/productStock.service.js');
const {
  dongBoYeuCauHoanHangTuDon,
  ghiNhanLichSuTrangThaiDonHang,
  ganThongTinHoanHangChoDon
} = require('./order-sidecar.service.js');

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

function hasRequestedReturn(order) {
  if (!order || !order.yeucauhoanhang) return false;
  const req = order.yeucauhoanhang;
  return Boolean(req.requestedAt || req.reason || req.refundMethod || req.proofMedia || req.proofImage);
}

function buildExportLineKey({ sanphamid, bientheid, kichco }) {
  const productId = String(sanphamid || '').trim();
  const variantId = bientheid ? String(bientheid).trim() : 'main';
  const sizeKey = String(kichco || '').trim();
  return `${productId}|${variantId}|${sizeKey}`;
}

function suyRaDanhSachHoanTheoChiTietPhieuNhap(orderItems = [], receiptDetails = []) {
  const rows = Array.isArray(receiptDetails) ? receiptDetails : [];
  if (!rows.length) return [];

  const directRows = normalizeReturnItemsPayload(rows.map((item) => ({
    orderItemId: item?.orderitemid || item?.orderItemId || item?.order_item_id || item?._id || '',
    qty: item?.soluong
  })));
  if (directRows.length) return directRows;

  const qtyByKey = new Map();
  for (const row of rows) {
    const key = buildExportLineKey({
      sanphamid: row?.sanphamid || row?.sanpham_id,
      bientheid: row?.bientheid || row?.bienthe_id,
      kichco: row?.kichco
    });
    const qty = toPositiveInt(row?.soluong, 0);
    if (!key || qty <= 0) continue;
    qtyByKey.set(key, toPositiveInt(qtyByKey.get(key), 0) + qty);
  }

  const derived = [];
  for (const item of (orderItems || [])) {
    const itemId = String(item?._id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(itemId)) continue;

    const key = buildExportLineKey({
      sanphamid: item?.sanpham_id,
      bientheid: item?.bienthe_id,
      kichco: item?.kichco
    });
    const remainQty = toPositiveInt(qtyByKey.get(key), 0);
    if (remainQty <= 0) continue;

    const soldQty = toPositiveInt(item?.soluong, 0);
    const takeQty = Math.min(soldQty, remainQty);
    if (takeQty <= 0) continue;

    derived.push({
      orderItemId: itemId,
      qty: takeQty
    });
    qtyByKey.set(key, remainQty - takeQty);
  }

  return derived;
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0));
}

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

let daThongBaoFallbackTransaction = false;

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
    if (!daThongBaoFallbackTransaction) daThongBaoFallbackTransaction = true;
    return work(null);
  } finally {
    await session.endSession();
  }
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

function buildOrderItemFinancialMap(order, orderItems) {
  const rows = Array.isArray(orderItems) ? orderItems : [];
  const lines = rows.map((item, index) => {
    const id = String(item && item._id ? item._id : `item-${index}`).trim();
    const boughtQty = Math.max(0, toPositiveInt(item?.soluong, 0));
    const lineStored = toNumber(item?.thanhtien, 0);
    const unitFallback = toNumber(item?.giaban, 0) > 0
      ? toNumber(item?.giaban, 0)
      : toNumber(item?.giagoc, 0);
    const grossAmount = Math.max(0, roundMoney(lineStored > 0 ? lineStored : (unitFallback * boughtQty)));
    return { id, boughtQty, grossAmount };
  });

  const goodsSubtotal = Math.max(0, lines.reduce((sum, row) => sum + row.grossAmount, 0));
  const voucherRaw = toNumber(order?.voucher_discount, NaN);
  const voucherDiscount = Math.min(
    goodsSubtotal,
    Math.max(0, roundMoney(Number.isFinite(voucherRaw) ? voucherRaw : toNumber(order?.giamgia, 0)))
  );

  const voucherByItem = allocateProportionalAmounts(
    lines.map((line) => ({ id: line.id, amount: line.grossAmount })),
    voucherDiscount
  );

  const out = new Map();
  for (const line of lines) {
    const allocatedVoucher = Math.max(0, roundMoney(voucherByItem[line.id] || 0));
    out.set(line.id, {
      boughtQty: line.boughtQty,
      grossAmount: line.grossAmount,
      allocatedVoucher,
      lineAfterVoucher: Math.max(0, line.grossAmount - allocatedVoucher)
    });
  }

  return out;
}

function apDungDoanhThuHoanTheoVoucher({ allocations, orderItemFinancialMap }) {
  const map = orderItemFinancialMap instanceof Map ? orderItemFinancialMap : new Map();
  const rows = Array.isArray(allocations) ? allocations : [];
  if (!rows.length || !map.size) return;

  const grouped = new Map();
  for (const allocation of rows) {
    const itemId = String(allocation?.orderItem?._id || '').trim();
    if (!itemId) continue;
    if (!grouped.has(itemId)) grouped.set(itemId, []);
    grouped.get(itemId).push(allocation);
  }

  for (const [itemId, group] of grouped.entries()) {
    const finance = map.get(itemId);
    if (!finance) continue;

    const boughtQty = Math.max(0, toPositiveInt(finance.boughtQty, 0));
    const returnedQty = group.reduce((sum, row) => sum + Math.max(0, toPositiveInt(row?.qty, 0)), 0);
    if (boughtQty <= 0 || returnedQty <= 0) continue;

    const revenueTarget = splitAmountByQty(finance.lineAfterVoucher, boughtQty, returnedQty);
    const allocatedByRow = allocateProportionalAmounts(
      group.map((row, idx) => ({ id: String(idx), amount: Math.max(0, toPositiveInt(row?.qty, 0)) })),
      revenueTarget
    );

    for (let idx = 0; idx < group.length; idx += 1) {
      const row = group[idx];
      const amount = Math.max(0, roundMoney(allocatedByRow[String(idx)] || 0));
      row.returnDoanhThu = amount;
      row.returnLoiNhuan = roundMoney(amount - toNumber(row.returnGiaVon, 0));
    }
  }
}

function buildAllocationSlotsFromExportLine(line) {
  const exportedQty = toPositiveInt(line?.soluong, 0);
  const returnedQty = toPositiveInt(line?.soluonghoan, 0);
  const allocs = Array.isArray(line?.allocations) ? line.allocations : [];

  if (!allocs.length || exportedQty <= 0) {
    const unitCost = exportedQty > 0
      ? (toNumber(line?.giavon, 0) / exportedQty)
      : toNumber(line?.gianhap, 0);
    const storedRevenue = exportedQty > 0 ? (toNumber(line?.doanhthu, 0) / exportedQty) : 0;
    const unitRevenue = storedRevenue > 0
      ? storedRevenue
      : (toNumber(line?.giasaugiam, 0) > 0 ? toNumber(line?.giasaugiam, 0) : toNumber(line?.giaban, 0));
    const unitSell = toNumber(line?.giaban, 0);
    const unitProfit = unitRevenue - unitCost;

    return [{
      allocationRef: null,
      remainingQty: Math.max(0, exportedQty - returnedQty),
      unitCost,
      unitSell,
      unitRevenue,
      unitProfit
    }];
  }

  const sumStoredReturned = allocs.reduce((sum, a) => sum + toPositiveInt(a?.soluonghoan, 0), 0);
  let carryReturned = Math.max(0, returnedQty - sumStoredReturned);

  const slots = [];
  for (const alloc of allocs) {
    const allocQty = toPositiveInt(alloc?.soLuong, 0);
    if (allocQty <= 0) continue;

    const storedReturned = toPositiveInt(alloc?.soluonghoan, 0);
    const carry = Math.min(carryReturned, Math.max(0, allocQty - storedReturned));
    const effectiveReturned = storedReturned + carry;
    carryReturned -= carry;

    const remainingQty = Math.max(0, allocQty - effectiveReturned);

    const unitCost = toNumber(alloc?.giaNhap, 0);
    const unitSell = toNumber(alloc?.giaban, 0) > 0
      ? toNumber(alloc?.giaban, 0)
      : toNumber(alloc?.giaBanDeXuat, 0);
    const unitRevenue = toNumber(alloc?.doanhthu, 0) > 0
      ? (toNumber(alloc?.doanhthu, 0) / allocQty)
      : (toNumber(alloc?.giasaugiam, 0) > 0 ? toNumber(alloc?.giasaugiam, 0) : unitSell);
    const unitProfit = toNumber(alloc?.loinhuan, 0) > 0
      ? (toNumber(alloc?.loinhuan, 0) / allocQty)
      : (unitRevenue - unitCost);

    slots.push({
      allocationRef: alloc,
      remainingQty,
      unitCost,
      unitSell,
      unitRevenue,
      unitProfit
    });
  }

  return slots;
}

function tinhTySuatLoiNhuan({ doanhThu, loiNhuan }) {
  const dt = toNumber(doanhThu, 0);
  const ln = toNumber(loiNhuan, 0);
  if (dt <= 0) return 0;
  return Number(((ln / dt) * 100).toFixed(2));
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

async function lapKeHoachNhapKhoHoanTra({ order, exportReceipt, orderItems, requestedRows = [] }) {
  const rows = normalizeReturnItemsPayload(requestedRows);
  const approvedRequestedRows = normalizeReturnItemsPayload(
    order && order.yeucauhoanhang && (order.yeucauhoanhang.requestedItems || order.yeucauhoanhang.returnItems)
  );
  const orderItemMap = new Map();
  for (const item of (orderItems || [])) {
    const itemId = String(item?._id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(itemId)) continue;
    orderItemMap.set(itemId, item);
  }

  const approvedRequestedMap = new Map();
  for (const row of approvedRequestedRows) {
    approvedRequestedMap.set(String(row.orderItemId), toPositiveInt(row.qty, 0));
  }

  const requestedMap = new Map();
  if (rows.length) {
    for (const row of rows) {
      const itemId = String(row.orderItemId || '').trim();
      const requestedQty = toPositiveInt(row.qty, 0);
      if (!itemId || requestedQty <= 0) continue;

      const orderItem = orderItemMap.get(itemId);
      if (!orderItem) {
        return {
          ok: false,
          message: 'Không tìm thấy dòng sản phẩm hoàn trả hợp lệ để xử lý.'
        };
      }

      const soldQty = toPositiveInt(orderItem?.soluong, 0);
      if (requestedQty > soldQty) {
        return {
          ok: false,
          message: `Số lượng trả của sản phẩm ${String(orderItem?.tensanpham || '').trim() || itemId} vượt quá số lượng đã bánmua.`
        };
      }

      if (approvedRequestedMap.size > 0) {
        const approvedQty = toPositiveInt(approvedRequestedMap.get(itemId), 0);
        if (approvedQty <= 0) continue;
        if (requestedQty > approvedQty) {
          return {
            ok: false,
            message: `Số lượng trả của sản phẩm ${String(orderItem?.tensanpham || '').trim() || itemId} vượt quá số lượng đã duyệt hoàn (${approvedQty}).`
          };
        }
        requestedMap.set(itemId, requestedQty);
      } else {
        requestedMap.set(itemId, requestedQty);
      }
    }
  } else {
    for (const [itemId, approvedQty] of approvedRequestedMap.entries()) {
      requestedMap.set(itemId, toPositiveInt(approvedQty, 0));
    }
  }

  const hasReturnRequest = hasRequestedReturn(order);
  const hasPositiveRequestedQty = Array.from(requestedMap.values()).some((qty) => toPositiveInt(qty, 0) > 0);
  if (hasReturnRequest && (!requestedMap.size || !hasPositiveRequestedQty)) {
    return {
      ok: false,
      message: 'Yêu cầu hoàn hàng không có chi tiết sản phẩm hợp lệ để xử lý.'
    };
  }

  const slotsByKey = new Map();
  for (const line of (exportReceipt.chitiet || [])) {
    const exportedQty = toPositiveInt(line.soluong, 0);
    const returnedQty = toPositiveInt(line.soluonghoan, 0);
    const remainingQty = Math.max(0, exportedQty - returnedQty);
    if (remainingQty <= 0) continue;

    const key = buildExportLineKey({
      sanphamid: line.sanphamid,
      bientheid: line.bientheid,
      kichco: line.kichco
    });

    const slots = slotsByKey.get(key) || [];
    slots.push({
      line,
      remainingQty,
      allocationSlots: buildAllocationSlotsFromExportLine(line)
    });
    slotsByKey.set(key, slots);
  }

  const isManualSelection = requestedMap.size > 0;
  const allocations = [];

  for (const item of (orderItems || [])) {
    const orderItemId = String(item._id || '');
    const soldQty = toPositiveInt(item.soluong, 0);

    let requestedQty = isManualSelection
      ? toPositiveInt(requestedMap.get(orderItemId), 0)
      : soldQty;
    requestedQty = Math.min(requestedQty, soldQty);
    if (requestedQty <= 0) continue;

    const key = buildExportLineKey({
      sanphamid: item.sanpham_id,
      bientheid: item.bienthe_id,
      kichco: item.kichco
    });
    const slots = slotsByKey.get(key) || [];
    let canReturn = requestedQty;

    for (const slot of slots) {
      if (canReturn <= 0) break;
      if (slot.remainingQty <= 0) continue;

      let remainingForSlot = Math.min(slot.remainingQty, canReturn);
      const allocSlots = Array.isArray(slot.allocationSlots) ? slot.allocationSlots : [];

      if (allocSlots.length) {
        for (const allocSlot of allocSlots) {
          if (remainingForSlot <= 0) break;
          if (toPositiveInt(allocSlot.remainingQty, 0) <= 0) continue;

          const takeQty = Math.min(toPositiveInt(allocSlot.remainingQty, 0), remainingForSlot);
          allocSlot.remainingQty -= takeQty;
          slot.remainingQty -= takeQty;
          remainingForSlot -= takeQty;
          canReturn -= takeQty;

          const returnGiaVon = roundMoney(toNumber(allocSlot.unitCost, 0) * takeQty);
          const returnDoanhThu = roundMoney(toNumber(allocSlot.unitRevenue, 0) * takeQty);
          const returnLoiNhuan = roundMoney(toNumber(allocSlot.unitProfit, 0) * takeQty);

          allocations.push({
            orderItem: item,
            exportLine: slot.line,
            exportAllocation: allocSlot.allocationRef || null,
            qty: takeQty,
            unitCost: toNumber(allocSlot.unitCost, 0),
            unitSuggestedPrice: toNumber(allocSlot.unitSell, 0),
            returnGiaVon,
            returnDoanhThu,
            returnLoiNhuan
          });
        }
      } else if (remainingForSlot > 0) {
        const takeQty = remainingForSlot;
        slot.remainingQty -= takeQty;
        canReturn -= takeQty;

        const exportedQtyLine = Math.max(1, toPositiveInt(slot.line.soluong, 1));
        const unitCost = toNumber(slot.line.giavon, 0) > 0
          ? (toNumber(slot.line.giavon, 0) / exportedQtyLine)
          : toNumber(slot.line.gianhap, 0);
        const storedRevenue = toNumber(slot.line.doanhthu, 0) / exportedQtyLine;
        const unitRevenue = storedRevenue > 0
          ? storedRevenue
          : (toNumber(slot.line.giasaugiam, 0) > 0 ? toNumber(slot.line.giasaugiam, 0) : toNumber(slot.line.giaban, 0));
        const storedProfit = toNumber(slot.line.loinhuan, 0) / exportedQtyLine;
        const unitProfit = Number.isFinite(storedProfit) && storedProfit !== 0
          ? storedProfit
          : (unitRevenue - unitCost);

        allocations.push({
          orderItem: item,
          exportLine: slot.line,
          exportAllocation: null,
          qty: takeQty,
          unitCost,
          unitSuggestedPrice: toNumber(slot.line.giaban, 0),
          returnGiaVon: roundMoney(unitCost * takeQty),
          returnDoanhThu: roundMoney(unitRevenue * takeQty),
          returnLoiNhuan: roundMoney(unitProfit * takeQty)
        });
      }
    }

    if (canReturn > 0) {
      return {
        ok: false,
        message: ('Số lượng trả vượt quá số lượng còn có thể hoàn của sản phẩm ' + (item.tensanpham || '')).trim()
      };
    }
  }

  if (!allocations.length) {
    return { ok: false, message: 'Không có số lượng hoàn trả hợp lệ để xử lý.' };
  }

  const orderItemFinancialMap = buildOrderItemFinancialMap(order, orderItems);
  apDungDoanhThuHoanTheoVoucher({
    allocations,
    orderItemFinancialMap
  });

  const importDetails = allocations.map((allocation) => {
    const item = allocation.orderItem;
    const line = allocation.exportLine;
    const productId = String(item.sanpham_id || '').trim();
    const variantId = item.bienthe_id && mongoose.Types.ObjectId.isValid(String(item.bienthe_id))
      ? new mongoose.Types.ObjectId(String(item.bienthe_id))
      : null;
    const unitSuggestedPrice = Math.max(0, roundMoney(toNumber(allocation.unitSuggestedPrice, toNumber(line.giaban, 0))));

    return {
      sanphamid: new mongoose.Types.ObjectId(productId),
      orderitemid: item._id && mongoose.Types.ObjectId.isValid(String(item._id))
        ? new mongoose.Types.ObjectId(String(item._id))
        : undefined,
      tensanpham: String(item.tensanpham || line.tensanpham || ''),
      hinhanh: String(item.hinhanh || line.hinhanh || ''),
      bientheid: variantId,
      kichco: String(item.kichco || line.kichco || ''),
      mausac: String(item.mausac || line.mausac || ''),
      soluong: allocation.qty,
      gianhap: Math.max(0, roundMoney(allocation.unitCost)),
      giabandexuat: unitSuggestedPrice
    };
  });

  const tongTienNhap = importDetails.reduce((sum, item) => {
    return sum + (Number(item.soluong || 0) * Number(item.gianhap || 0));
  }, 0);

  return {
    ok: true,
    allocations,
    importDetails,
    tongTienNhap
  };
}

async function taoMaPhieuNhapHoanTraKhongTrung() {
  let maPhieuNhap = taoMaPhieuNhapHoanTra();
  while (await PhieuNhapKho.findOne({ maphieu: maPhieuNhap }).select('_id').lean()) {
    maPhieuNhap = taoMaPhieuNhapHoanTra();
  }
  return maPhieuNhap;
}

async function taoHoacCapNhatPhieuNhapHoanTraChoDon({ order, exportReceipt, importDetails, tongTienNhap, actor = null, existingReceipt = null }) {
  const now = new Date();
  const receipt = existingReceipt || new PhieuNhapKho();
  const maPhieuNhap = String(receipt.maphieu || receipt.ma_phieu || receipt.code || '').trim() || await taoMaPhieuNhapHoanTraKhongTrung();

  receipt.code = maPhieuNhap;
  receipt.maphieu = maPhieuNhap;
  receipt.ma_phieu = maPhieuNhap;
  receipt.loaiphieu = 'return';
  receipt.tenloaiphieu = 'Nhập kho hoàn trả';
  receipt.nguonnhap = 'Trả hàng khách';
  receipt.donhang_id = order._id;
  receipt.madonhang = String(order.madonhang || '');
  receipt.phieuxuat_id = exportReceipt._id;
  receipt.maphieuxuat = String(exportReceipt.maphieu || '');
  receipt.ngaynhap = now;
  receipt.nhacungcap = 'Trả hàng khách';
  receipt.ghichu = 'Đơn hàng: ' + String(order.madonhang || '') + ' | Phiếu xuất: ' + String(exportReceipt.maphieu || '');
  receipt.tongtiennhap = tongTienNhap;
  receipt.chitiet = importDetails;
  receipt.daxuatkho = false;
  receipt.ngayxuatkho = null;
  receipt.nguoixuatkho = null;
  receipt.nhanvienky = {
    tennhanvien: String(actor?.hoten || actor?.email || '').trim(),
    idnhanvien: String(actor?._id || '').trim(),
    anhchuky: String(actor?.chukyso || actor?.chuKy || actor?.avatar || '').trim(),
    thoigianky: now
  };
  if (!receipt.nguoitao) receipt.nguoitao = actor?._id || null;
  if (!receipt.ngaytao) receipt.ngaytao = now;
  receipt.ngaycapnhat = now;
  await receipt.save();
  return receipt;
}

function taoDanhSachDaNhanTuKeHoach(plan = {}) {
  return (Array.isArray(plan.importDetails) ? plan.importDetails : []).map((item) => ({
    orderItemId: item?.orderitemid || null,
    qty: Math.max(0, toPositiveInt(item?.soluong, 0)),
    boughtQty: 0,
    tensanpham: String(item?.tensanpham || '').trim(),
    hinhanh: String(item?.hinhanh || '').trim(),
    kichco: String(item?.kichco || '').trim(),
    mausac: String(item?.mausac || '').trim(),
    gianhap: Math.max(0, roundMoney(item?.gianhap || 0)),
    giabandexuat: Math.max(0, roundMoney(item?.giabandexuat || 0))
  })).filter((item) => item.qty > 0);
}

function taoChiTietPhieuNhapTuHangDaNhan({ orderItems = [], receivedItems = [] } = {}) {
  const itemMap = new Map();
  for (const item of (orderItems || [])) {
    const itemId = String(item?._id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(itemId)) continue;
    itemMap.set(itemId, item);
  }

  const importDetails = [];
  for (const row of (Array.isArray(receivedItems) ? receivedItems : [])) {
    const orderItemId = String(row?.orderItemId || row?._id || '').trim();
    const orderItem = itemMap.get(orderItemId);
    if (!orderItem) continue;

    const productId = String(orderItem?.sanpham_id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) continue;

    const variantId = orderItem?.bienthe_id && mongoose.Types.ObjectId.isValid(String(orderItem.bienthe_id))
      ? new mongoose.Types.ObjectId(String(orderItem.bienthe_id))
      : null;
    const qty = Math.max(0, toPositiveInt(row?.qty, 0));
    if (qty <= 0) continue;

    importDetails.push({
      sanphamid: new mongoose.Types.ObjectId(productId),
      orderitemid: new mongoose.Types.ObjectId(orderItemId),
      tensanpham: String(row?.tensanpham || orderItem?.tensanpham || '').trim(),
      hinhanh: String(row?.hinhanh || orderItem?.hinhanh || '').trim(),
      bientheid: variantId,
      kichco: String(row?.kichco || orderItem?.kichco || '').trim(),
      mausac: String(row?.mausac || orderItem?.mausac || '').trim(),
      soluong: qty,
      gianhap: Math.max(0, roundMoney(row?.gianhap || 0)),
      giabandexuat: Math.max(0, roundMoney(row?.giabandexuat || 0))
    });
  }

  const tongTienNhap = importDetails.reduce((sum, item) => {
    return sum + (Number(item.soluong || 0) * Number(item.gianhap || 0));
  }, 0);

  return {
    importDetails,
    tongTienNhap
  };
}

async function dongBoNhapKhoHoanTra({ id, payload = {}, actor = null }) {
  const orderId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, message: 'ID đơn hàng không hợp lệ' };
  }

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };
  await ganThongTinHoanHangChoDon(order);

  const currentStatus = String(order.trangthai || '');
  if (['returned', 'returned_full', 'returned_partial', 'refunded'].includes(currentStatus)) {
    return { ok: true, message: 'Đơn hàng đã được ghi nhận hàng hoàn thực tế trước đó.' };
  }
  if (!['approved_return', 'return_shipping'].includes(currentStatus)) {
    return { ok: false, message: 'Đơn hàng chưa ở trạng thái nhận hàng hoàn.' };
  }

  const exportReceipt = await PhieuXuatKho.findOne({ donhang_id: order._id });
  if (!exportReceipt) {
    return { ok: false, message: 'Không tìm thấy phiếu xuất kho của đơn hàng này' };
  }

  const existingReceipt = await PhieuNhapKho.findOne({ donhang_id: order._id, loaiphieu: 'return' })
    .sort({ ngaytao: -1, _id: -1 });

  if (existingReceipt && existingReceipt.daxuatkho) {
    return {
      ok: true,
      message: 'Phiếu nhập hoàn trả đã được xác nhận trước đó.',
      receiptId: existingReceipt._id,
      data: {
        alreadySynced: true,
        importReceiptCode: String(existingReceipt.maphieu || ''),
        exportReceiptCode: String(exportReceipt.maphieu || ''),
        orderCode: String(order.madonhang || '')
      }
    };
  }

  const orderItems = await Chitietdonhang.find({ donhang_id: order._id }).lean();
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return { ok: false, message: 'Đơn hàng không có sản phẩm để hoàn trả' };
  }

  const payloadRequestedRows = normalizeReturnItemsPayload(payload && payload.returnItems);
  const storedRequestedRows = normalizeReturnItemsPayload(
    order && order.yeucauhoanhang && (order.yeucauhoanhang.requestedItems || order.yeucauhoanhang.returnItems)
  );

  const plan = await lapKeHoachNhapKhoHoanTra({
    order,
    exportReceipt,
    orderItems,
    requestedRows: payloadRequestedRows.length ? payloadRequestedRows : storedRequestedRows
  });
  if (!plan.ok) return plan;

  let result = null;
  let sidecarPayload = null;

  try {
    result = await chayVoiTransactionNeuHoTro(async (session) => {
      const orderDoc = await ganSessionNeuCo(Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }), session);
      if (!orderDoc) throw new Error('Không tìm thấy đơn hàng');

      const exportReceiptDoc = await ganSessionNeuCo(PhieuXuatKho.findOne({ donhang_id: orderDoc._id }), session);
      if (!exportReceiptDoc) throw new Error('Không tìm thấy phiếu xuất kho của đơn hàng này');

      let tongGiamDoanhThu = 0;
      let tongGiamGiaVon = 0;
      let tongGiamLoiNhuan = 0;
      let tongSoLuongTra = 0;
      const restoreQtyByLotId = new Map();

      for (const allocation of plan.allocations) {
        const line = allocation.exportLine;
        const targetLine = (exportReceiptDoc.chitiet || []).find((row) => String(row?._id || '') === String(line?._id || ''));
        if (!targetLine) continue;

        targetLine.soluonghoan = toNumber(targetLine.soluonghoan, 0) + allocation.qty;
        targetLine.doanhthuhoan = toNumber(targetLine.doanhthuhoan, 0) + allocation.returnDoanhThu;
        targetLine.giavonhoan = toNumber(targetLine.giavonhoan, 0) + allocation.returnGiaVon;
        targetLine.loinhuanhoan = toNumber(targetLine.loinhuanhoan, 0) + allocation.returnLoiNhuan;

        if (allocation.exportAllocation && Array.isArray(targetLine.allocations)) {
          const lotIdKey = String(allocation.exportAllocation?.lotId || '').trim();
          if (lotIdKey) {
            const targetAlloc = targetLine.allocations.find((alloc) => String(alloc?.lotId || '') === lotIdKey);
            if (targetAlloc) {
              targetAlloc.soluonghoan = toNumber(targetAlloc.soluonghoan, 0) + allocation.qty;
            }
            restoreQtyByLotId.set(lotIdKey, toPositiveInt(restoreQtyByLotId.get(lotIdKey), 0) + allocation.qty);
          }
        }

        tongGiamDoanhThu += allocation.returnDoanhThu;
        tongGiamGiaVon += allocation.returnGiaVon;
        tongGiamLoiNhuan += allocation.returnLoiNhuan;
        tongSoLuongTra += allocation.qty;
      }

      exportReceiptDoc.tongdoanhthuhoan = toNumber(exportReceiptDoc.tongdoanhthuhoan, 0) + tongGiamDoanhThu;
      exportReceiptDoc.tonggiavonhoan = toNumber(exportReceiptDoc.tonggiavonhoan, 0) + tongGiamGiaVon;
      exportReceiptDoc.tongloinhuanhoan = toNumber(exportReceiptDoc.tongloinhuanhoan, 0) + tongGiamLoiNhuan;
      exportReceiptDoc.tongdoanhthu = Math.max(0, toNumber(exportReceiptDoc.tongdoanhthu, 0) - tongGiamDoanhThu);
      exportReceiptDoc.tonggiavon = Math.max(0, toNumber(exportReceiptDoc.tonggiavon, 0) - tongGiamGiaVon);
      exportReceiptDoc.tongloinhuan = toNumber(exportReceiptDoc.tongdoanhthu, 0) - toNumber(exportReceiptDoc.tonggiavon, 0);
      exportReceiptDoc.tysuatloinhuan = tinhTySuatLoiNhuan({
        doanhThu: exportReceiptDoc.tongdoanhthu,
        loiNhuan: exportReceiptDoc.tongloinhuan
      });
      exportReceiptDoc.ngaycapnhat = new Date();
      await exportReceiptDoc.save(taoSessionOptions(session));

      // Hoàn tồn đúng lô đã xuất bán (FIFO) để giữ chuẩn giá vốn/lãi-lỗ theo từng kho lô.
      for (const [lotId, qtyRestore] of restoreQtyByLotId.entries()) {
        if (!mongoose.Types.ObjectId.isValid(String(lotId)) || qtyRestore <= 0) continue;
        await TonKhoLo.updateOne(
          { _id: new mongoose.Types.ObjectId(String(lotId)) },
          {
            $inc: { soluongconlai: qtyRestore },
            $set: { ngaycapnhat: new Date() }
          },
          taoSessionOptions(session)
        );
      }

      // Cộng trả hàng hoàn về kho ngay tại bước xác nhận đã nhận hàng hoàn.
      const stockProductIds = Array.from(new Set(
        (Array.isArray(plan.importDetails) ? plan.importDetails : [])
          .map((item) => String(item && item.sanphamid ? item.sanphamid : ''))
          .filter((itemId) => mongoose.Types.ObjectId.isValid(itemId))
      ));
      const stockProductDocs = await ganSessionNeuCo(Sanpham.find({ _id: { $in: stockProductIds } }), session);
      const stockProductMap = new Map(stockProductDocs.map((productDoc) => [String(productDoc._id), productDoc]));

      for (const detail of (Array.isArray(plan.importDetails) ? plan.importDetails : [])) {
        const productDoc = stockProductMap.get(String(detail && detail.sanphamid ? detail.sanphamid : ''));
        if (!productDoc) continue;

        congTonChoDongTraHang(productDoc, {
          variantId: detail.bientheid,
          size: detail.kichco,
          qty: detail.soluong,
          mausac: detail.mausac
        });
      }

      const nowStockSync = new Date();
      for (const productDoc of stockProductDocs) {
        productDoc.soluongton = tinhTongTon(productDoc);
        productDoc.ngaycapnhat = nowStockSync;
        await productDoc.save(taoSessionOptions(session));
      }

      const allReturned = (exportReceiptDoc.chitiet || []).every((line) => {
        const exportedQty = toPositiveInt(line.soluong, 0);
        const returnedQty = toPositiveInt(line.soluonghoan, 0);
        return returnedQty >= exportedQty;
      });

      const previousStatus = String(orderDoc.trangthai || '');
      const tongGiamDoanhThuLuyKe = toNumber(orderDoc.tonggiamdoanhthu_hoantra, 0) + tongGiamDoanhThu;
      const receivedItems = taoDanhSachDaNhanTuKeHoach(plan);
      const now = new Date();

      orderDoc.tamtinh = Math.max(0, toNumber(orderDoc.tamtinh, 0) - tongGiamDoanhThu);
      orderDoc.tongtien = Math.max(0, toNumber(orderDoc.tongtien, 0) - tongGiamDoanhThu);
      orderDoc.tonggiamdoanhthu_hoantra = tongGiamDoanhThuLuyKe;
      orderDoc.tonggiamloinhuan_hoantra = toNumber(orderDoc.tonggiamloinhuan_hoantra, 0) + tongGiamLoiNhuan;
      orderDoc.tongsoluong_hoantra = toPositiveInt(orderDoc.tongsoluong_hoantra, 0) + tongSoLuongTra;
      orderDoc.trangthai = allReturned ? 'returned_full' : 'returned_partial';
      orderDoc.ngaycapnhat = now;
      orderDoc.yeucauhoanhang = {
        ...(orderDoc.yeucauhoanhang || {}),
        returnedAt: now,
        refundAmount: tongGiamDoanhThuLuyKe,
        receivedItems
      };
      await orderDoc.save(taoSessionOptions(session));

      sidecarPayload = {
        order: {
          _id: orderDoc._id,
          nguoidung_id: orderDoc.nguoidung_id,
          madonhang: orderDoc.madonhang,
          trangthai: orderDoc.trangthai,
          yeucauhoanhang: orderDoc.yeucauhoanhang
        },
        previousStatus,
        nextStatus: String(orderDoc.trangthai || ''),
        allReturned,
        refundAmount: tongGiamDoanhThuLuyKe
      };

      const statusLabel = allReturned ? 'đã trả hàng' : 'trả hàng một phần';
      return {
        ok: true,
        message: 'Đã xác nhận đã nhận hàng hoàn và cập nhật phiếu xuất (' + statusLabel + ').',
        data: {
          exportReceiptCode: String(exportReceiptDoc.maphieu || ''),
          orderCode: String(orderDoc.madonhang || ''),
          allReturned
        }
      };
    }, 'return receive transaction');
  } catch (error) {
    result = { ok: false, message: error && error.message ? error.message : 'Không thể xác nhận đã nhận hàng hoàn.' };
  }

  if (result && result.ok && sidecarPayload) {
    await dongBoSidecarAnToan('return receive sidecar sync', async () => {
      await dongBoYeuCauHoanHangTuDon({
        order: sidecarPayload.order,
        action: 'system_received_return_goods',
        actor
      });
      await ghiNhanLichSuTrangThaiDonHang({
        order: sidecarPayload.order,
        previousStatus: sidecarPayload.previousStatus,
        nextStatus: sidecarPayload.nextStatus,
        action: 'system_received_return_goods',
        actor,
        metadata: {
          allReturned: sidecarPayload.allReturned,
          refundAmount: sidecarPayload.refundAmount
        }
      });
    });
  }

  return result || { ok: false, message: 'Không thể xác nhận đã nhận hàng hoàn.' };

  const importReceipt = await taoHoacCapNhatPhieuNhapHoanTraChoDon({
    order,
    exportReceipt,
    importDetails: plan.importDetails,
    tongTienNhap: plan.tongTienNhap,
    actor,
    existingReceipt
  });

  return {
    ok: true,
    message: existingReceipt
      ? (' Cập nhật phiếu nhập hoàn trả ' + String(importReceipt.maphieu || '') + '. Vui lòng vào Nhập kho để xác nhận.')
      : ('Đã tạo phiếu nhập hoàn trả ' + String(importReceipt.maphieu || '') + '. Vui lòng vào Nhập kho để xác nhận.'),
    receiptId: importReceipt._id,
    data: {
      importReceiptCode: String(importReceipt.maphieu || ''),
      exportReceiptCode: String(exportReceipt.maphieu || ''),
      orderCode: String(order.madonhang || '')
    }
  };
}

async function taoPhieuNhapHoanTraSauHoanTien({ id, actor = null }) {
  const orderId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, message: 'ID đơn hàng không hợp lệ' };
  }

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };
  await ganThongTinHoanHangChoDon(order);

  if (String(order.trangthai || '') !== 'refunded') {
    return { ok: false, message: 'Chỉ có thể tạo phiếu nhập hoàn trả sau khi đơn hàng đã hoàn tiền.' };
  }

  const [exportReceipt, existingReceipt, orderItems] = await Promise.all([
    PhieuXuatKho.findOne({ donhang_id: order._id }),
    PhieuNhapKho.findOne({ donhang_id: order._id, loaiphieu: 'return' }).sort({ ngaytao: -1, _id: -1 }),
    Chitietdonhang.find({ donhang_id: order._id }).lean()
  ]);

  if (!exportReceipt) {
    return { ok: false, message: 'Không tìm thấy phiếu xuất kho của đơn hàng này' };
  }

  if (existingReceipt) {
    return {
      ok: true,
      message: existingReceipt.daxuatkho
        ? ('Phiếu nhập hoàn trả ' + String(existingReceipt.maphieu || '') + ' đã được xác nhận nhập kho.')
        : ('Đã có phiếu nhập hoàn trả ' + String(existingReceipt.maphieu || '') + '. Vui lòng vào Nhập kho để xác nhận.'),
      receiptId: existingReceipt._id,
      data: {
        importReceiptCode: String(existingReceipt.maphieu || ''),
        exportReceiptCode: String(exportReceipt.maphieu || ''),
        orderCode: String(order.madonhang || '')
      }
    };
  }

  const receivedItems = Array.isArray(order?.yeucauhoanhang?.receivedItems)
    ? order.yeucauhoanhang.receivedItems
    : [];
  const receiptPlan = taoChiTietPhieuNhapTuHangDaNhan({ orderItems, receivedItems });
  if (!receiptPlan.importDetails.length) {
    return { ok: false, message: 'Chưa có dữ liệu hàng đã nhận hoàn thực tế để tạo phiếu nhập.' };
  }

  const importReceipt = await taoHoacCapNhatPhieuNhapHoanTraChoDon({
    order,
    exportReceipt,
    importDetails: receiptPlan.importDetails,
    tongTienNhap: receiptPlan.tongTienNhap,
    actor,
    existingReceipt: null
  });

  return {
    ok: true,
    message: 'Đã tạo phiếu nhập hoàn trả ' + String(importReceipt.maphieu || '') + '. Vui lòng vào Nhập kho để xác nhận.',
    receiptId: importReceipt._id,
    data: {
      importReceiptCode: String(importReceipt.maphieu || ''),
      exportReceiptCode: String(exportReceipt.maphieu || ''),
      orderCode: String(order.madonhang || '')
    }
  };
}

async function xacNhanNhapKhoPhieuNhapHoanTra({ receiptId, actor = null }) {
  const rawReceiptId = String(receiptId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(rawReceiptId)) {
    return { ok: false, message: 'ID phiếu nhập không hợp lệ' };
  }

  let result = null;
  let sidecarPayload = null;

  try {
    result = await chayVoiTransactionNeuHoTro(async (session) => {
      const importReceipt = await ganSessionNeuCo(PhieuNhapKho.findOne({
        _id: rawReceiptId,
        loaiphieu: 'return'
      }), session);
      if (!importReceipt) throw new Error('Không tìm thấy phiếu nhập hoàn trả');

      if (importReceipt.daxuatkho) {
        return {
          ok: true,
          message: 'Phiếu nhập hoàn trả đã được xác nhận trước đó.',
          receiptId: importReceipt._id
        };
      }

      const orderAfterRefund = await ganSessionNeuCo(Donhang.findOne({ _id: importReceipt.donhang_id, daxoa: { $ne: true } }), session);
      if (orderAfterRefund && String(orderAfterRefund.trangthai || '') !== 'refunded') {
        throw new Error('Đơn hàng chưa hoàn tiền nên chưa thể nhập kho hàng hoàn.');
      }

      const receiptDetails = Array.isArray(importReceipt.chitiet) ? importReceipt.chitiet : [];
      if (!receiptDetails.length) throw new Error('Phiếu nhập hoàn trả không có chi tiết sản phẩm.');

      const nowStockSync = new Date();
      const returnLotDocs = receiptDetails.map((item) => ({
        phieunhap_id: importReceipt._id,
        maphieunhap: String(importReceipt.maphieu || importReceipt.ma_phieu || importReceipt.code || ''),
        ngaynhap: importReceipt.ngaynhap || nowStockSync,
        nhacungcap: String(importReceipt.nhacungcap || 'Khách trả hàng'),
        sanphamid: item.sanphamid,
        bientheid: item.bientheid || null,
        kichco: String(item.kichco || ''),
        mausac: String(item.mausac || ''),
        gianhap: Number(item.gianhap || 0),
        giabandexuat: Number(item.giabandexuat || 0),
        soluongnhap: Number(item.soluong || 0),
        soluongconlai: Number(item.soluong || 0),
        ngaytao: nowStockSync,
        ngaycapnhat: nowStockSync
      })).filter((lot) => Number(lot.soluongnhap || 0) > 0);
      if (returnLotDocs.length) {
        await TonKhoLo.insertMany(returnLotDocs, taoSessionOptions(session));
      }

      const stockProductIds = Array.from(new Set(receiptDetails
        .map((item) => String(item.sanphamid || ''))
        .filter((itemId) => mongoose.Types.ObjectId.isValid(itemId))));
      const stockProductDocs = await ganSessionNeuCo(Sanpham.find({ _id: { $in: stockProductIds } }), session);
      const stockProductMap = new Map(stockProductDocs.map((productDoc) => [String(productDoc._id), productDoc]));

      for (const detail of receiptDetails) {
        const productDoc = stockProductMap.get(String(detail.sanphamid || ''));
        if (!productDoc) continue;
        congTonChoDongTraHang(productDoc, {
          variantId: detail.bientheid,
          size: detail.kichco,
          qty: detail.soluong,
          mausac: detail.mausac
        });
      }

      for (const productDoc of stockProductDocs) {
        productDoc.soluongton = tinhTongTon(productDoc);
        productDoc.ngaycapnhat = nowStockSync;
        await productDoc.save(taoSessionOptions(session));
      }

      importReceipt.daxuatkho = true;
      importReceipt.ngayxuatkho = nowStockSync;
      importReceipt.nguoixuatkho = actor?._id || null;
      importReceipt.ngaycapnhat = nowStockSync;
      await importReceipt.save(taoSessionOptions(session));

      return {
        ok: true,
        message: 'Đã xác nhận nhập kho phiếu hoàn trả ' + String(importReceipt.maphieu || '') + '.',
        receiptId: importReceipt._id,
        data: {
          importReceiptCode: String(importReceipt.maphieu || ''),
          orderCode: String(orderAfterRefund?.madonhang || '')
        }
      };
      return;

      const order = await Donhang.findOne({ _id: importReceipt.donhang_id, daxoa: { $ne: true } }).session(session);
      if (!order) throw new Error('Không tìm thấy đơn hàng của phiếu nhập hoàn trả');
      await ganThongTinHoanHangChoDon(order);

      const exportReceipt = await PhieuXuatKho.findOne({ _id: importReceipt.phieuxuat_id || undefined, donhang_id: order._id }).session(session)
        || await PhieuXuatKho.findOne({ donhang_id: order._id }).session(session);
      if (!exportReceipt) throw new Error('Không tìm thấy phiếu xuất kho của đơn hàng này');

      const orderItems = await Chitietdonhang.find({ donhang_id: order._id }).session(session).lean();
      if (!Array.isArray(orderItems) || orderItems.length === 0) {
        throw new Error('Đơn hàng không có sản phẩm để hoàn trả');
      }

      const requestedRows = suyRaDanhSachHoanTheoChiTietPhieuNhap(
        orderItems,
        importReceipt.chitiet || []
      );

      const plan = await lapKeHoachNhapKhoHoanTra({
        order,
        exportReceipt,
        orderItems,
        requestedRows
      });
      if (!plan.ok) throw new Error(plan.message || 'không thể lập kế hoạch nhập kho hoàn trả');

      const now = new Date();
      const lotDocs = plan.importDetails.map((item) => ({
        phieunhap_id: importReceipt._id,
        maphieunhap: String(importReceipt.maphieu || importReceipt.ma_phieu || importReceipt.code || ''),
        ngaynhap: importReceipt.ngaynhap || now,
        nhacungcap: String(importReceipt.nhacungcap || 'Khách trả hàng'),
        sanphamid: item.sanphamid,
        bientheid: item.bientheid || null,
        kichco: String(item.kichco || ''),
        mausac: String(item.mausac || ''),
        gianhap: Number(item.gianhap || 0),
        giabandexuat: Number(item.giabandexuat || 0),
        soluongnhap: Number(item.soluong || 0),
        soluongconlai: Number(item.soluong || 0),
        ngaytao: now,
        ngaycapnhat: now
      })).filter((lot) => Number(lot.soluongnhap || 0) > 0);
      if (lotDocs.length) {
        await TonKhoLo.insertMany(lotDocs, { session });
      }

      const productIds = Array.from(new Set(plan.importDetails
        .map((item) => String(item.sanphamid || ''))
        .filter((itemId) => mongoose.Types.ObjectId.isValid(itemId))));
      const productDocs = await Sanpham.find({ _id: { $in: productIds } }).session(session);
      const productMap = new Map(productDocs.map((productDoc) => [String(productDoc._id), productDoc]));

      for (const detail of plan.importDetails) {
        const productDoc = productMap.get(String(detail.sanphamid || ''));
        if (!productDoc) continue;
        congTonChoDongTraHang(productDoc, {
          variantId: detail.bientheid,
          size: detail.kichco,
          qty: detail.soluong,
          mausac: detail.mausac
        });
      }

      for (const productDoc of productDocs) {
        productDoc.soluongton = tinhTongTon(productDoc);
        productDoc.ngaycapnhat = now;
        await productDoc.save({ session });
      }

      let tongGiamDoanhThu = 0;
      let tongGiamGiaVon = 0;
      let tongGiamLoiNhuan = 0;
      let tongSoLuongTra = 0;

      for (const allocation of plan.allocations) {
        const line = allocation.exportLine;
        line.soluonghoan = toNumber(line.soluonghoan, 0) + allocation.qty;
        line.doanhthuhoan = toNumber(line.doanhthuhoan, 0) + allocation.returnDoanhThu;
        line.giavonhoan = toNumber(line.giavonhoan, 0) + allocation.returnGiaVon;
        line.loinhuanhoan = toNumber(line.loinhuanhoan, 0) + allocation.returnLoiNhuan;
        if (allocation.exportAllocation) {
          allocation.exportAllocation.soluonghoan = toNumber(allocation.exportAllocation.soluonghoan, 0) + allocation.qty;
        }

        tongGiamDoanhThu += allocation.returnDoanhThu;
        tongGiamGiaVon += allocation.returnGiaVon;
        tongGiamLoiNhuan += allocation.returnLoiNhuan;
        tongSoLuongTra += allocation.qty;
      }

      exportReceipt.tongdoanhthuhoan = toNumber(exportReceipt.tongdoanhthuhoan, 0) + tongGiamDoanhThu;
      exportReceipt.tonggiavonhoan = toNumber(exportReceipt.tonggiavonhoan, 0) + tongGiamGiaVon;
      exportReceipt.tongloinhuanhoan = toNumber(exportReceipt.tongloinhuanhoan, 0) + tongGiamLoiNhuan;
      exportReceipt.tongdoanhthu = Math.max(0, toNumber(exportReceipt.tongdoanhthu, 0) - tongGiamDoanhThu);
      exportReceipt.tonggiavon = Math.max(0, toNumber(exportReceipt.tonggiavon, 0) - tongGiamGiaVon);
      exportReceipt.tongloinhuan = toNumber(exportReceipt.tongdoanhthu, 0) - toNumber(exportReceipt.tonggiavon, 0);
      exportReceipt.tysuatloinhuan = tinhTySuatLoiNhuan({
        doanhThu: exportReceipt.tongdoanhthu,
        loiNhuan: exportReceipt.tongloinhuan
      });
      exportReceipt.ngaycapnhat = now;
      await exportReceipt.save({ session });

      const allReturned = (exportReceipt.chitiet || []).every((line) => {
        const exportedQty = toPositiveInt(line.soluong, 0);
        const returnedQty = toPositiveInt(line.soluonghoan, 0);
        return returnedQty >= exportedQty;
      });

      const keepRefundedStatus = String(order.trangthai || '') === 'refunded';
      const previousStatus = String(order.trangthai || '');
      const tongGiamDoanhThuLuyKe = toNumber(order.tonggiamdoanhthu_hoantra, 0) + tongGiamDoanhThu;
      order.tamtinh = Math.max(0, toNumber(order.tamtinh, 0) - tongGiamDoanhThu);
      order.tongtien = Math.max(0, toNumber(order.tongtien, 0) - tongGiamDoanhThu);
      order.tonggiamdoanhthu_hoantra = tongGiamDoanhThuLuyKe;
      order.tonggiamloinhuan_hoantra = toNumber(order.tonggiamloinhuan_hoantra, 0) + tongGiamLoiNhuan;
      order.tongsoluong_hoantra = toPositiveInt(order.tongsoluong_hoantra, 0) + tongSoLuongTra;
      order.trangthai = keepRefundedStatus
        ? 'refunded'
        : (allReturned ? 'returned_full' : 'returned_partial');
      order.ngaycapnhat = now;
      order.yeucauhoanhang = {
        ...(order.yeucauhoanhang || {}),
        returnedAt: now,
        refundAmount: tongGiamDoanhThuLuyKe
      };
      await order.save({ session });

      importReceipt.chitiet = plan.importDetails;
      importReceipt.tongtiennhap = plan.tongTienNhap;
      importReceipt.daxuatkho = true;
      importReceipt.ngayxuatkho = now;
      importReceipt.nguoixuatkho = actor?._id || null;
      importReceipt.ngaycapnhat = now;
      await importReceipt.save({ session });

      sidecarPayload = {
        order: {
          _id: order._id,
          nguoidung_id: order.nguoidung_id,
          madonhang: order.madonhang,
          trangthai: order.trangthai,
          yeucauhoanhang: order.yeucauhoanhang
        },
        previousStatus,
        nextStatus: String(order.trangthai || ''),
        allReturned,
        refundAmount: tongGiamDoanhThuLuyKe
      };

      const statusLabel = allReturned ? 'đã trả hàng' : 'trả hàng một phần';
      result = {
        ok: true,
        message: 'Đã xác nhận nhập kho phiếu hoàn trả ' + String(importReceipt.maphieu || '') + ' (' + statusLabel + ').',
        receiptId: importReceipt._id,
        data: {
          importReceiptCode: String(importReceipt.maphieu || ''),
          exportReceiptCode: String(exportReceipt.maphieu || ''),
          orderCode: String(order.madonhang || ''),
          allReturned
        }
      };
    }, 'return import confirm transaction');
  } catch (error) {
    result = { ok: false, message: error && error.message ? error.message : 'Không thể xác nhận nhập kho hoàn trả.' };
  }

  if (result && result.ok && sidecarPayload) {
    await dongBoSidecarAnToan('return receive sidecar sync', async () => {
      await dongBoYeuCauHoanHangTuDon({
        order: sidecarPayload.order,
        action: 'system_received_return_goods',
        actor
      });
      await ghiNhanLichSuTrangThaiDonHang({
        order: sidecarPayload.order,
        previousStatus: sidecarPayload.previousStatus,
        nextStatus: sidecarPayload.nextStatus,
        action: 'system_received_return_goods',
        actor,
        metadata: {
          allReturned: sidecarPayload.allReturned,
          refundAmount: sidecarPayload.refundAmount
        }
      });
    });
  }

  return result || { ok: false, message: 'Không thể xác nhận nhập kho hoàn trả.' };
}

module.exports = {
  dongBoNhapKhoHoanTra,
  taoPhieuNhapHoanTraSauHoanTien,
  xacNhanNhapKhoPhieuNhapHoanTra
};
