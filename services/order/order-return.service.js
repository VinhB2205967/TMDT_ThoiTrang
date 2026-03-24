const mongoose = require('mongoose');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const TonKhoLo = require('../../models/inventory_lot_model');
const { laLoaiKhongSize, tinhTongTon } = require('../catalog/productStock.service.js');

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

function roundMoney(value) {
  return Math.round(toNumber(value, 0));
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

async function dongBoNhapKhoHoanTra({ id, payload = {}, actor = null }) {
  const orderId = String(id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, message: 'ID đơn hàng không hợp lệ' };
  }

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };

  const currentStatus = String(order.trangthai || '');
  const keepRefundedStatus = currentStatus === 'refunded';

  if (!['approved_return', 'return_shipping', 'returned', 'returned_full', 'returned_partial', 'refunded'].includes(currentStatus)) {
    return { ok: false, message: 'Đơn chưa ở trạng thái nhận hàng hoàn.' };
  }

  const exportReceipt = await PhieuXuatKho.findOne({ donhang_id: order._id });
  if (!exportReceipt) {
    return { ok: false, message: 'Không tìm thấy phiếu xuất kho của đơn hàng này' };
  }

  const alreadySynced = (exportReceipt.chitiet || []).length > 0
    && (exportReceipt.chitiet || []).every((line) => {
      const exportedQty = toPositiveInt(line.soluong, 0);
      const returnedQty = toPositiveInt(line.soluonghoan, 0);
      return returnedQty >= exportedQty;
    });

  if (alreadySynced) {
    if (!keepRefundedStatus && String(order.trangthai || '') !== 'returned_full') {
      order.trangthai = 'returned_full';
      order.ngaycapnhat = new Date();
      await order.save();
    }

    return {
      ok: true,
      message: 'Đơn này đã đồng bộ nhập kho hoàn trả trước đó.',
      data: {
        alreadySynced: true,
        exportReceiptCode: String(exportReceipt.maphieu || ''),
        orderCode: String(order.madonhang || ''),
        allReturned: true
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
  const requestedMap = new Map();
  const approvedRequestedMap = new Map();
  for (const row of storedRequestedRows) {
    approvedRequestedMap.set(String(row.orderItemId), toPositiveInt(row.qty, 0));
  }

  // Always constrain actual return quantities by the customer's approved requested items.
  if (payloadRequestedRows.length) {
    for (const row of payloadRequestedRows) {
      const itemId = String(row.orderItemId);
      const payloadQty = toPositiveInt(row.qty, 0);

      if (approvedRequestedMap.size > 0) {
        const approvedQty = toPositiveInt(approvedRequestedMap.get(itemId), 0);
        if (approvedQty <= 0) continue;
        requestedMap.set(itemId, Math.min(payloadQty, approvedQty));
      } else {
        requestedMap.set(itemId, payloadQty);
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
      message: 'Yêu cầu hoàn hàng không có chi tiết sản phẩm. Vui lòng chọn đúng sản phẩm và số lượng cần hoàn trước khi đồng bộ.'
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

  for (const item of orderItems) {
    const orderItemId = String(item._id);
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
        message: `Số lượng trả vượt quá số lượng còn có thể hoàn của sản phẩm ${item.tensanpham || ''}`.trim()
      };
    }
  }

  if (!allocations.length) {
    return { ok: false, message: 'Không có số lượng hoàn trả hợp lệ để xử lý' };
  }

  const now = new Date();
  let maPhieuNhap = taoMaPhieuNhapHoanTra();
  while (await PhieuNhapKho.findOne({ maphieu: maPhieuNhap }).select('_id').lean()) {
    maPhieuNhap = taoMaPhieuNhapHoanTra();
  }

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

  const importReceipt = new PhieuNhapKho({
    code: maPhieuNhap,
    maphieu: maPhieuNhap,
    ma_phieu: maPhieuNhap,
    loaiphieu: 'return',
    tenloaiphieu: 'Nhập kho hoàn trả',
    nguonnhap: 'Trả hàng khách',
    donhang_id: order._id,
    madonhang: String(order.madonhang || ''),
    phieuxuat_id: exportReceipt._id,
    maphieuxuat: String(exportReceipt.maphieu || ''),
    ngaynhap: now,
    nhacungcap: 'Trả hàng khách',
    ghichu: `Đơn hàng: ${String(order.madonhang || '')} | Phiếu xuất: ${String(exportReceipt.maphieu || '')}`,
    tongtiennhap: tongTienNhap,
    chitiet: importDetails,
    daxuatkho: true,
    ngayxuatkho: now,
    nguoixuatkho: actor?._id || null,
    nhanvienky: {
      tennhanvien: String(actor?.hoten || actor?.email || '').trim(),
      idnhanvien: String(actor?._id || '').trim(),
      anhchuky: String(actor?.avatar || '').trim(),
      thoigianky: now
    },
    nguoitao: actor?._id || null,
    ngaytao: now,
    ngaycapnhat: now
  });
  await importReceipt.save();

  const lotDocs = importDetails.map((item) => ({
    phieunhap_id: importReceipt._id,
    maphieunhap: maPhieuNhap,
    ngaynhap: now,
    nhacungcap: 'Trả hàng khách',
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
    await TonKhoLo.insertMany(lotDocs);
  }

  const productIds = Array.from(new Set(importDetails
    .map((item) => String(item.sanphamid || ''))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))));
  const productDocs = await Sanpham.find({ _id: { $in: productIds } });
  const productMap = new Map(productDocs.map((p) => [String(p._id), p]));

  for (const detail of importDetails) {
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
    await productDoc.save();
  }

  let tongGiamDoanhThu = 0;
  let tongGiamGiaVon = 0;
  let tongGiamLoiNhuan = 0;
  let tongSoLuongTra = 0;

  for (const allocation of allocations) {
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
  await exportReceipt.save();

  const allReturned = (exportReceipt.chitiet || []).every((line) => {
    const exportedQty = toPositiveInt(line.soluong, 0);
    const returnedQty = toPositiveInt(line.soluonghoan, 0);
    return returnedQty >= exportedQty;
  });

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
  await order.save();

  const statusLabel = allReturned ? 'Đã trả hàng' : 'Trả hàng một phần';
  return {
    ok: true,
    message: `Đã tạo phiếu nhập hoàn trả ${maPhieuNhap} (${statusLabel}).`,
    data: {
      importReceiptCode: maPhieuNhap,
      exportReceiptCode: String(exportReceipt.maphieu || ''),
      orderCode: String(order.madonhang || ''),
      allReturned
    }
  };
}

module.exports = {
  dongBoNhapKhoHoanTra
};
