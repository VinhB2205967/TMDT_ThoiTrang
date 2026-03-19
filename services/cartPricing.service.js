const sanpham = require('../models/product_model');
const TonKhoLo = require('../models/inventory_lot_model');
const mongoose = require('mongoose');
const { laLoaiKhongSize, layBienTheVaTon } = require('./productStock.service');
const { getFlashSalePercentMap, tinhGiaFlash } = require('./flashSale.service');
const SHIPPING_CONFIG = require('../config/shipping');

function tinhPhanTramTuGia(giaGoc, giaSauGiam) {
  const goc = Number(giaGoc || 0);
  const giam = Number(giaSauGiam || 0);
  if (!(goc > 0) || !(giam > 0) || giam >= goc) return 0;
  return Math.round(((goc - giam) / goc) * 100);
}

function tinhSoLuongHienThiGio(giohang) {
  if (!giohang || !Array.isArray(giohang.sanpham)) return 0;
  return giohang.sanpham.length;
}

function taoDieuKienBienTheChoLo(variantId) {
  const raw = String(variantId || '').trim();
  if (!raw || raw === 'main') {
    return {
      $or: [
        { bientheid: null },
        { bientheid: { $exists: false } }
      ]
    };
  }

  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  return { bientheid: new mongoose.Types.ObjectId(raw) };
}

async function tinhGiaTheoLoFIFO({ productDoc, item, giaMacDinh }) {
  const productId = String(item?.sanpham_id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(productId)) return null;

  const soLuongCan = Math.max(1, Number(item?.soluong || 1));
  const variantCond = taoDieuKienBienTheChoLo(item?.bienthe_id);
  if (!variantCond) return null;

  const hasSize = !laLoaiKhongSize(productDoc?.loaisanpham);
  const sizeKey = hasSize ? String(item?.kichco || '').trim() : '';

  const lots = await TonKhoLo.find({
    sanphamid: new mongoose.Types.ObjectId(productId),
    kichco: sizeKey,
    soluongconlai: { $gt: 0 },
    ...variantCond
  })
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 })
    .select('soluongconlai giabandexuat')
    .lean();

  if (!lots.length) return null;

  let conLai = soLuongCan;
  let tongTien = 0;
  let daLay = 0;
  const allocations = [];

  for (const lot of lots) {
    if (conLai <= 0) break;
    const ton = Math.max(0, Number(lot?.soluongconlai || 0));
    if (ton <= 0) continue;

    const lay = Math.min(ton, conLai);
    const giaLo = Math.max(0, Number(lot?.giabandexuat || 0)) || Math.max(0, Number(giaMacDinh || 0));

    tongTien += (lay * giaLo);
    daLay += lay;
    conLai -= lay;
    allocations.push({ soLuong: lay, gia: giaLo });
  }

  if (daLay <= 0) return null;

  if (conLai > 0) {
    const fallbackGia = Math.max(0, Number(giaMacDinh || 0));
    tongTien += conLai * fallbackGia;
    allocations.push({ soLuong: conLai, gia: fallbackGia });
    daLay += conLai;
  }

  return {
    tongTien,
    donGiaBinhQuan: daLay > 0 ? (tongTien / daLay) : Math.max(0, Number(giaMacDinh || 0)),
    allocations
  };
}

function layPhanTramGiamMacDinh({ productDoc, item, ketqua }) {
  const variantId = String(item?.bienthe_id || '').trim();
  if (variantId && variantId !== 'main') {
    const variant = (productDoc?.bienthe || []).find((v) => String(v?._id) === variantId);
    if (Number.isFinite(Number(variant?.phantramgiamgia))) {
      return Math.max(0, Number(variant.phantramgiamgia));
    }
  }

  if (Number.isFinite(Number(productDoc?.phantramgiamgia))) {
    return Math.max(0, Number(productDoc.phantramgiamgia));
  }

  return Math.max(0, tinhPhanTramTuGia(ketqua?.gia, ketqua?.giagiam));
}

async function dongBoGiaGioHang(giohang, { capNhatTonKho = false } = {}) {
  if (!giohang || !Array.isArray(giohang.sanpham) || !giohang.sanpham.length) return false;

  const productIds = [...new Set(
    giohang.sanpham
      .map((it) => String(it.sanpham_id || '').trim())
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
  )];

  if (!productIds.length) return false;

  const docs = await sanpham.find({
    _id: { $in: productIds },
    daxoa: { $ne: true },
    trangthai: 'dangban'
  });

  const docMap = new Map(docs.map((doc) => [String(doc._id), doc]));
  const flashPercentMap = await getFlashSalePercentMap(productIds);

  let changed = false;

  for (const item of giohang.sanpham) {
    const productDoc = docMap.get(String(item.sanpham_id || ''));
    if (!productDoc) {
      if (capNhatTonKho && item.tonkho !== 0) item.tonkho = 0;
      continue;
    }

    const ketqua = layBienTheVaTon(productDoc, item.bienthe_id, item.kichco);

    if (capNhatTonKho) {
      const tonkho = ketqua?.error ? 0 : Math.max(0, Number(ketqua.stock || 0));
      item.tonkho = tonkho;
      if (tonkho > 0 && Number(item.soluong || 0) > tonkho) {
        item.soluong = tonkho;
        changed = true;
      }
    }

    if (ketqua?.error) continue;

    const qty = Math.max(1, Number(item.soluong || 1));
    const giaNen = Number(ketqua.gia || item.gia || 0);
    const quoteTheoLo = await tinhGiaTheoLoFIFO({
      productDoc,
      item,
      giaMacDinh: giaNen
    });
    const giaGoc = Number(quoteTheoLo?.donGiaBinhQuan ?? giaNen);

    const phanTramGoc = layPhanTramGiamMacDinh({ productDoc, item, ketqua });
    const phanTramFlash = Number(flashPercentMap.get(String(item.sanpham_id || '')) || 0);
    const phanTramApDung = phanTramFlash > 0 ? phanTramFlash : phanTramGoc;

    let giaGiam = giaGoc;
    let lineTotal = 0;

    if (quoteTheoLo) {
      if (phanTramApDung > 0) {
        lineTotal = quoteTheoLo.allocations.reduce((sum, a) => {
          const unitAfter = tinhGiaFlash(Number(a.gia || 0), phanTramApDung) || Number(a.gia || 0);
          return sum + (Math.max(0, Number(a.soLuong || 0)) * unitAfter);
        }, 0);
      } else {
        lineTotal = Math.round(Number(quoteTheoLo.tongTien || 0));
      }
      giaGiam = qty > 0 ? (lineTotal / qty) : giaGoc;
    } else {
      giaGiam = phanTramApDung > 0 ? (tinhGiaFlash(giaGoc, phanTramApDung) || giaGoc) : giaGoc;
      lineTotal = Math.round(giaGiam * qty);
    }

    if (Number(item.gia || 0) !== giaGoc) {
      item.gia = giaGoc;
      changed = true;
    }
    if (Number(item.giagiam || 0) !== giaGiam) {
      item.giagiam = giaGiam;
      changed = true;
    }
    if (Number(item.thanhtien || 0) !== lineTotal) {
      item.thanhtien = lineTotal;
      changed = true;
    }
  }

  return changed;
}

function normalizeShippingRegion(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (SHIPPING_CONFIG.regions && SHIPPING_CONFIG.regions[key]) return key;
  return SHIPPING_CONFIG.defaultRegion || 'noithanh';
}

function calcShippingFee(subtotal, regionKey) {
  const total = Number(subtotal || 0);
  if (total >= Number(SHIPPING_CONFIG.freeShipThreshold || 0)) return 0;
  return Number(SHIPPING_CONFIG.regions?.[regionKey]?.fee || 0);
}

module.exports = {
  tinhSoLuongHienThiGio,
  dongBoGiaGioHang,
  normalizeShippingRegion,
  calcShippingFee
};
