const mongoose = require('mongoose');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const TonKhoLo = require('../../models/inventory_lot_model');
const { NO_SIZE_TYPES } = require('../../config/constants');
const { tinhTongTon } = require('../catalog/productStock.service.js');

function laLoaiKhongSize(loaisanpham) {
  return NO_SIZE_TYPES.includes(String(loaisanpham || '').toLowerCase());
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function taoMaPhieuXuat() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `XK${y}${m}${day}-${h}${min}${s}-${rand}`;
}

function taoThongTinNhanVienKy(adminUser, fallback = {}) {
  const u = adminUser || null;
  return {
    tennhanvien: String(fallback.tennhanvien || u?.hoten || u?.email || '').trim(),
    idnhanvien: String(fallback.idnhanvien || u?._id || '').trim(),
    anhchuky: String(fallback.anhchuky || u?.avatar || '').trim(),
    thoigianky: fallback.thoigianky || new Date()
  };
}

async function buildCostMapForProductIds(productIds) {
  if (!productIds.length) return new Map();
  const objectIds = productIds
    .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
  if (!objectIds.length) return new Map();

  const rows = await PhieuNhapKho.aggregate([
    { $unwind: '$chitiet' },
    { $match: { 'chitiet.sanphamid': { $in: objectIds } } },
    {
      $group: {
        _id: {
          sanphamid: '$chitiet.sanphamid',
          bientheid: '$chitiet.bientheid',
          kichco: '$chitiet.kichco'
        },
        avgCost: { $avg: '$chitiet.gianhap' }
      }
    }
  ]);

  const map = new Map();
  rows.forEach((row) => {
    const pid = row?._id?.sanphamid ? String(row._id.sanphamid) : '';
    const vid = row?._id?.bientheid ? String(row._id.bientheid) : 'main';
    const size = row?._id?.kichco ? String(row._id.kichco) : 'nosize';
    map.set(`${pid}|${vid}|${size}`, toNumber(row.avgCost, 0));
  });
  return map;
}

function resolveAvgCost(costMap, { productId, variantId, size }) {
  const pid = String(productId || '');
  const vid = variantId ? String(variantId) : 'main';
  const sizeKey = String(size || '').trim() || 'nosize';

  return (
    toNumber(costMap.get(`${pid}|${vid}|${sizeKey}`), NaN)
    || toNumber(costMap.get(`${pid}|${vid}|nosize`), NaN)
    || toNumber(costMap.get(`${pid}|main|${sizeKey}`), NaN)
    || toNumber(costMap.get(`${pid}|main|nosize`), 0)
  );
}

function buildLotQuery({ productId, variantId, size }) {
  const query = {
    sanphamid: new mongoose.Types.ObjectId(String(productId)),
    soluongconlai: { $gt: 0 }
  };

  if (variantId && mongoose.Types.ObjectId.isValid(String(variantId))) {
    query.bientheid = new mongoose.Types.ObjectId(String(variantId));
  } else {
    query.bientheid = null;
  }

  const sizeKey = String(size || '').trim();
  if (sizeKey) {
    query.kichco = sizeKey;
  } else {
    query.kichco = '';
  }

  return query;
}

async function consumeLotsFIFO({ productId, variantId, size, qty }) {
  const soLuongCanXuat = toNumber(qty, 0);
  if (soLuongCanXuat <= 0) throw new Error('Sá»‘ lÆ°á»£ng xuáº¥t khÃ´ng há»£p lá»‡');

  const lots = await TonKhoLo.find(buildLotQuery({ productId, variantId, size }))
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 });

  let conLaiCanXuat = soLuongCanXuat;
  let tongGiaVon = 0;
  const allocations = [];

  for (const lot of lots) {
    if (conLaiCanXuat <= 0) break;
    const available = toNumber(lot.soluongconlai, 0);
    if (available <= 0) continue;

    const take = Math.min(available, conLaiCanXuat);
    const unitCost = toNumber(lot.gianhap, 0);

    lot.soluongconlai = available - take;
    lot.ngaycapnhat = new Date();
    await lot.save();

    allocations.push({
      lotId: String(lot._id),
      soLuong: take,
      giaNhap: unitCost,
      giaBanDeXuat: toNumber(lot.giabandexuat, 0)
    });

    tongGiaVon += take * unitCost;
    conLaiCanXuat -= take;
  }

  if (conLaiCanXuat > 0) {
    throw new Error('KhÃ´ng Ä‘á»§ tá»“n theo lÃ´ FIFO Ä‘á»ƒ xuáº¥t kho');
  }

  return {
    tongGiaVon,
    giaNhapBinhQuan: soLuongCanXuat > 0 ? (tongGiaVon / soLuongCanXuat) : 0,
    allocations
  };
}

async function resolveSuggestedPriceAfterConsume({ productId, variantId, size, allocations }) {
  const currentLot = await TonKhoLo.findOne(buildLotQuery({ productId, variantId, size }))
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 })
    .select('giabandexuat')
    .lean();

  const fromRemaining = toNumber(currentLot?.giabandexuat, 0);
  if (fromRemaining > 0) return fromRemaining;

  const alloc = Array.isArray(allocations) ? allocations : [];
  for (let i = alloc.length - 1; i >= 0; i -= 1) {
    const price = toNumber(alloc[i]?.giaBanDeXuat, 0);
    if (price > 0) return price;
  }

  return 0;
}

function applySuggestedPriceToProductDoc(productDoc, { variantId, suggestedPrice }) {
  const price = toNumber(suggestedPrice, 0);
  if (price <= 0) return false;

  const isMain = !variantId;
  if (isMain) {
    if (toNumber(productDoc.gia, 0) === price) return false;
    productDoc.gia = price;
    return true;
  }

  const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
  if (!variant) return false;
  if (toNumber(variant.gia, 0) === price) return false;
  variant.gia = price;
  return true;
}

function truTonKhoTheoDong(productDoc, { variantId, size, qty }) {
  const soLuong = toNumber(qty, 0);
  if (soLuong <= 0) throw new Error('Sá»‘ lÆ°á»£ng xuáº¥t khÃ´ng há»£p lá»‡');

  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);
  const isMain = !variantId;

  if (hasSize) {
    const sizeKey = String(size || '').trim();
    if (!sizeKey) throw new Error('Thiáº¿u size cho sáº£n pháº©m cÃ³ size');

    if (isMain) {
      productDoc.sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const row = productDoc.sizes.find((s) => String(s.size) === sizeKey);
      const current = toNumber(row?.soluong, 0);
      const next = current - soLuong;
      if (next < 0) throw new Error('Tá»“n kho khÃ´ng Ä‘á»§ Ä‘á»ƒ xuáº¥t (size chÃ­nh)');
      if (row) row.soluong = next;
      else productDoc.sizes.push({ size: sizeKey, soluong: 0 });
      return;
    }

    const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
    if (!variant) throw new Error('Biáº¿n thá»ƒ khÃ´ng tá»“n táº¡i');
    variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
    const row = variant.sizes.find((s) => String(s.size) === sizeKey);
    const current = toNumber(row?.soluong, 0);
    const next = current - soLuong;
    if (next < 0) throw new Error('Tá»“n kho khÃ´ng Ä‘á»§ Ä‘á»ƒ xuáº¥t (size biáº¿n thá»ƒ)');
    if (row) row.soluong = next;
    else variant.sizes.push({ size: sizeKey, soluong: 0 });
    return;
  }

  if (isMain) {
    const current = toNumber(productDoc.soluong_chinh, 0);
    const next = current - soLuong;
    if (next < 0) throw new Error('Tá»“n kho khÃ´ng Ä‘á»§ Ä‘á»ƒ xuáº¥t (sáº£n pháº©m chÃ­nh)');
    productDoc.soluong_chinh = next;
    return;
  }

  const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
  if (!variant) throw new Error('Biáº¿n thá»ƒ khÃ´ng tá»“n táº¡i');
  const current = toNumber(variant.soluong, 0);
  const next = current - soLuong;
  if (next < 0) throw new Error('Tá»“n kho khÃ´ng Ä‘á»§ Ä‘á»ƒ xuáº¥t (biáº¿n thá»ƒ)');
  variant.soluong = next;
}

function congTonKhoTheoDong(productDoc, { variantId, size, qty }) {
  const soLuong = toNumber(qty, 0);
  if (soLuong <= 0) throw new Error('Sá»‘ lÆ°á»£ng xuáº¥t khÃ´ng há»£p lá»‡');

  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);
  const isMain = !variantId;

  if (hasSize) {
    const sizeKey = String(size || '').trim();
    if (!sizeKey) throw new Error('Thiáº¿u size cho sáº£n pháº©m cÃ³ size');

    if (isMain) {
      productDoc.sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const row = productDoc.sizes.find((s) => String(s.size) === sizeKey);
      const current = toNumber(row?.soluong, 0);
      const next = current + soLuong;
      if (row) row.soluong = next;
      else productDoc.sizes.push({ size: sizeKey, soluong: soLuong });
      return;
    }

    const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
    if (!variant) throw new Error('Biáº¿n thá»ƒ khÃ´ng tá»“n táº¡i');
    variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
    const row = variant.sizes.find((s) => String(s.size) === sizeKey);
    const current = toNumber(row?.soluong, 0);
    const next = current + soLuong;
    if (row) row.soluong = next;
    else variant.sizes.push({ size: sizeKey, soluong: soLuong });
    return;
  }

  if (isMain) {
    const current = toNumber(productDoc.soluong_chinh, 0);
    productDoc.soluong_chinh = current + soLuong;
    return;
  }

  const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
  if (!variant) throw new Error('Biáº¿n thá»ƒ khÃ´ng tá»“n táº¡i');
  const current = toNumber(variant.soluong, 0);
  variant.soluong = current + soLuong;
}

function calcFinanceForLine({ qty, giaNhap, giaBan, phanTramGiam, giaVon: giaVonOverride }) {
  const soLuong = toNumber(qty, 0);
  const priceNhap = toNumber(giaNhap, 0);
  const priceBan = toNumber(giaBan, 0);
  const giam = Math.max(0, toNumber(phanTramGiam, 0));
  const giaSauGiam = giam > 0 ? Math.round(priceBan - (priceBan * giam / 100)) : priceBan;
  const doanhThu = soLuong * giaSauGiam;
  const giaVon = Number.isFinite(Number(giaVonOverride)) ? Number(giaVonOverride) : (soLuong * priceNhap);
  const loiNhuan = doanhThu - giaVon;
  return {
    giaSauGiam,
    doanhThu,
    giaVon,
    loiNhuan
  };
}

function calcFinanceByAllocations({ allocations, fallbackGiaBan = 0, fallbackPhanTramGiam = 0 }) {
  const src = Array.isArray(allocations) ? allocations : [];
  const fallbackBan = Math.max(0, toNumber(fallbackGiaBan, 0));
  const fallbackGiam = Math.max(0, toNumber(fallbackPhanTramGiam, 0));

  const out = [];
  let tongSoLuong = 0;
  let tongGiaBan = 0;
  let tongGiaSauGiam = 0;
  let tongDoanhThu = 0;
  let tongGiaVon = 0;

  for (const a of src) {
    const soLuong = Math.max(0, toNumber(a?.soLuong, 0));
    if (soLuong <= 0) continue;

    const giaNhap = Math.max(0, toNumber(a?.giaNhap, 0));
    const giaBanDeXuat = Math.max(0, toNumber(a?.giaBanDeXuat, 0));
    const giaBan = giaBanDeXuat > 0 ? giaBanDeXuat : fallbackBan;
    const phanTramGiam = fallbackGiam;
    const giaSauGiam = phanTramGiam > 0
      ? Math.round(giaBan - (giaBan * phanTramGiam / 100))
      : giaBan;

    const doanhThu = soLuong * giaSauGiam;
    const giaVon = soLuong * giaNhap;
    const loiNhuan = doanhThu - giaVon;

    out.push({
      lotId: a?.lotId || null,
      soLuong,
      giaNhap,
      giaBanDeXuat,
      giaban: giaBan,
      phantramgiam: phanTramGiam,
      giasaugiam: giaSauGiam,
      doanhthu: doanhThu,
      giavon: giaVon,
      loinhuan: loiNhuan
    });

    tongSoLuong += soLuong;
    tongGiaBan += soLuong * giaBan;
    tongGiaSauGiam += soLuong * giaSauGiam;
    tongDoanhThu += doanhThu;
    tongGiaVon += giaVon;
  }

  const tongLoiNhuan = tongDoanhThu - tongGiaVon;

  return {
    allocations: out,
    tongSoLuong,
    tongDoanhThu,
    tongGiaVon,
    tongLoiNhuan,
    gianhap: tongSoLuong > 0 ? (tongGiaVon / tongSoLuong) : 0,
    giaban: tongSoLuong > 0 ? (tongGiaBan / tongSoLuong) : 0,
    giasaugiam: tongSoLuong > 0 ? (tongGiaSauGiam / tongSoLuong) : 0,
    phantramgiam: 0
  };
}

function calcTotals(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  const tongSoLuong = arr.reduce((sum, it) => sum + toNumber(it.soluong, 0), 0);
  const tongDoanhThu = arr.reduce((sum, it) => sum + toNumber(it.doanhthu, 0), 0);
  const tongGiaVon = arr.reduce((sum, it) => sum + toNumber(it.giavon, 0), 0);
  const tongLoiNhuan = tongDoanhThu - tongGiaVon;
  const tySuat = tongDoanhThu > 0 ? (tongLoiNhuan / tongDoanhThu) * 100 : 0;

  return {
    tongsoluong: tongSoLuong,
    tongdoanhthu: tongDoanhThu,
    tonggiavon: tongGiaVon,
    tongloinhuan: tongLoiNhuan,
    tysuatloinhuan: Number(tySuat.toFixed(2))
  };
}

async function createExportReceiptFromOrder({ orderId, adminUser, note = '', skipInventoryAdjustments = false }) {
  const oid = String(orderId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(oid)) {
    throw new Error('orderId khÃ´ng há»£p lá»‡');
  }

  const existed = await PhieuXuatKho.findOne({ donhang_id: oid }).select('_id maphieu').lean();
  if (existed) {
    return { created: false, receiptId: String(existed._id), maphieu: existed.maphieu, reason: 'already_exists' };
  }

  const order = await Donhang.findOne({ _id: oid, daxoa: { $ne: true } }).lean();
  if (!order) throw new Error('KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng');

  const orderItems = await Chitietdonhang.find({ donhang_id: oid }).lean();
  if (!orderItems.length) throw new Error('ÄÆ¡n hÃ ng chÆ°a cÃ³ sáº£n pháº©m');

  const productIds = Array.from(new Set(orderItems.map((it) => String(it.sanpham_id || '')).filter((id) => mongoose.Types.ObjectId.isValid(id))));
  const productDocs = await Sanpham.find({ _id: { $in: productIds } });
  const productMap = new Map(productDocs.map((p) => [String(p._id), p]));

  const costMap = await buildCostMapForProductIds(productIds);

  const lines = [];

  for (const item of orderItems) {
    const productId = String(item.sanpham_id || '').trim();
    const productDoc = productMap.get(productId);
    if (!productDoc) throw new Error('Sáº£n pháº©m trong Ä‘Æ¡n khÃ´ng tá»“n táº¡i');

    const variantId = item.bienthe_id ? String(item.bienthe_id) : null;
    const size = String(item.kichco || '').trim();
    const qty = Math.max(1, parseInt(item.soluong, 10) || 1);

    let variant = null;
    if (variantId) {
      variant = (productDoc.bienthe || []).find((v) => String(v._id) === variantId) || null;
      if (!variant) throw new Error('Biáº¿n thá»ƒ trong Ä‘Æ¡n khÃ´ng tá»“n táº¡i');
    }

    if (!skipInventoryAdjustments) {
      truTonKhoTheoDong(productDoc, { variantId, size, qty });
    }

    const giaBanGoc = toNumber(item.giagoc, toNumber(variant?.gia, toNumber(productDoc.gia, 0)));
    const giaSauGiamFromOrder = toNumber(item.giaban, giaBanGoc);
    const percent = giaBanGoc > 0
      ? Math.max(0, Number((((giaBanGoc - giaSauGiamFromOrder) / giaBanGoc) * 100).toFixed(2)))
      : 0;

    let fifoCost;
    if (!skipInventoryAdjustments) {
      try {
        fifoCost = await consumeLotsFIFO({ productId, variantId, size, qty });
      } catch (fifoErr) {
        // Fallback Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch dá»¯ liá»‡u cÅ© chÆ°a cÃ³ báº£ng lÃ´.
        const giaNhapFallback = resolveAvgCost(costMap, { productId, variantId, size });
        fifoCost = {
          tongGiaVon: qty * giaNhapFallback,
          giaNhapBinhQuan: giaNhapFallback,
          allocations: []
        };
      }

      const suggestedPrice = await resolveSuggestedPriceAfterConsume({
        productId,
        variantId,
        size,
        allocations: fifoCost.allocations
      });
      applySuggestedPriceToProductDoc(productDoc, { variantId, suggestedPrice });
    } else {
      const giaNhapFallback = resolveAvgCost(costMap, { productId, variantId, size });
      fifoCost = {
        tongGiaVon: qty * giaNhapFallback,
        giaNhapBinhQuan: giaNhapFallback,
        allocations: []
      };
    }

    const fallbackAllocations = fifoCost.allocations && fifoCost.allocations.length
      ? fifoCost.allocations
      : [{ soLuong: qty, giaNhap: fifoCost.giaNhapBinhQuan, giaBanDeXuat: giaBanGoc }];

    const allocationFinance = calcFinanceByAllocations({
      allocations: fallbackAllocations,
      fallbackGiaBan: giaBanGoc,
      fallbackPhanTramGiam: percent
    });

    const avgGiaBan = allocationFinance.giaban;
    const avgGiaSauGiam = allocationFinance.giasaugiam;
    const avgPhanTram = avgGiaBan > 0
      ? Math.max(0, Number((((avgGiaBan - avgGiaSauGiam) / avgGiaBan) * 100).toFixed(2)))
      : 0;

    lines.push({
      sanphamid: productDoc._id,
      tensanpham: item.tensanpham || productDoc.tensanpham || '',
      bientheid: variant?._id || null,
      kichco: size,
      mausac: item.mausac || variant?.mausac || productDoc.mausac_chinh || '',
      soluong: qty,
      gianhap: allocationFinance.gianhap,
      giaban: avgGiaBan,
      phantramgiam: avgPhanTram,
      giasaugiam: avgGiaSauGiam,
      doanhthu: allocationFinance.tongDoanhThu,
      giavon: allocationFinance.tongGiaVon,
      loinhuan: allocationFinance.tongLoiNhuan,
      allocations: allocationFinance.allocations,
      hinhanh: item.hinhanh || variant?.hinhanh || productDoc.hinhanh || '',
      ghichudong: ''
    });
  }

  if (!skipInventoryAdjustments) {
    for (const productDoc of productDocs) {
      productDoc.soluongton = tinhTongTon(productDoc);
      productDoc.ngaycapnhat = new Date();
      await productDoc.save();
    }
  }

  const totals = calcTotals(lines);

  const receipt = new PhieuXuatKho({
    maphieu: taoMaPhieuXuat(),
    donhang_id: order._id,
    madonhang: order.madonhang || '',
    ngayxuat: new Date(),
    noinhan: order.diachigiao || '',
    lydo: note || 'Xuáº¥t kho theo Ä‘Æ¡n hÃ ng Ä‘Ã£ xÃ¡c nháº­n',
    ...totals,
    nguoitaophieu: 'order',
    chitiet: lines,
    nhanvienky: taoThongTinNhanVienKy(adminUser),
    nguoitao: adminUser?._id || null,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  try {
    await receipt.save();
  } catch (err) {
    if (err && Number(err.code) === 11000) {
      const doc = await PhieuXuatKho.findOne({ donhang_id: order._id }).select('_id maphieu').lean();
      if (doc) {
        return { created: false, receiptId: String(doc._id), maphieu: doc.maphieu, reason: 'already_exists' };
      }
    }
    throw err;
  }

  return { created: true, receiptId: String(receipt._id), maphieu: receipt.maphieu };
}

module.exports = {
  createExportReceiptFromOrder,
  calcFinanceForLine,
  calcTotals,
  buildCostMapForProductIds,
  resolveAvgCost,
  consumeLotsFIFO,
  resolveSuggestedPriceAfterConsume,
  applySuggestedPriceToProductDoc,
  taoThongTinNhanVienKy,
  taoMaPhieuXuat,
  truTonKhoTheoDong,
  congTonKhoTheoDong,
  calcFinanceByAllocations
};

