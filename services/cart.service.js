const Giohang = require('../models/cart_model');
const sanpham = require('../models/product_model');
const TonKhoLo = require('../models/inventory_lot_model');
const mongoose = require('mongoose');
const { NO_SIZE_TYPES } = require('../config/constants');
const SHIPPING_CONFIG = require('../config/shipping');
const { getFlashSalePercentMap, tinhGiaFlash } = require('./catalog/flashSale.service.js');
const {
  consumeLotsFIFO,
  resolveSuggestedPriceAfterConsume,
  applySuggestedPriceToProductDoc
} = require('./inventory/exportReceipt.service.js');

function normalizeImage(path) {
  if (!path) return '/images/shopping.png';
  if (path.startsWith('/public')) return path.replace('/public', '');
  return path;
}

function laLoaiKhongSize(loaisanpham) {
  return NO_SIZE_TYPES.includes(String(loaisanpham || '').toLowerCase());
}

function tinhTongTon(productdoc) {
  if (!productdoc) return 0;

  const coSize = !laLoaiKhongSize(productdoc.loaisanpham);
  let tong = 0;

  if (coSize) {
    (productdoc.sizes || []).forEach((s) => {
      tong += s && s.soluong ? Number(s.soluong) : 0;
    });

    (productdoc.bienthe || []).forEach((v) => {
      (v.sizes || []).forEach((s) => {
        tong += s && s.soluong ? Number(s.soluong) : 0;
      });
    });

    return tong;
  }

  tong += Number(productdoc.soluong_chinh || 0);
  (productdoc.bienthe || []).forEach((v) => {
    tong += Number(v.soluong || 0);
  });

  return tong;
}

function layBienTheVaTon(productdoc, bientheId, kichco) {
  const coSize = !laLoaiKhongSize(productdoc.loaisanpham);
  const laChinh = !bientheId || bientheId === 'main';

  if (laChinh) {
    const mausac = productdoc.mausac_chinh || 'Mặc định';
    const hinhanh = normalizeImage(productdoc.hinhanh);
    const gia = productdoc.gia || 0;
    const giamgia = productdoc.phantramgiamgia || 0;
    const giagiam = giamgia > 0 ? Math.round((gia * (100 - giamgia)) / 100) : gia;

    if (coSize) {
      const sizes = Array.isArray(productdoc.sizes) ? productdoc.sizes : [];
      const dongsize = sizes.find((s) => s.size === kichco);
      const tonkho = dongsize ? dongsize.soluong || 0 : 0;
      return {
        hasSize: coSize,
        stock: tonkho,
        bienTheObjId: null,
        mausac,
        hinhanh,
        gia,
        giagiam
      };
    }

    const tonkho = productdoc.soluong_chinh || 0;
    return {
      hasSize: coSize,
      stock: tonkho,
      bienTheObjId: null,
      mausac,
      hinhanh,
      gia,
      giagiam
    };
  }

  const bienthe = (productdoc.bienthe || []).find((v) => String(v._id) === String(bientheId));
  if (!bienthe) return { error: 'Biến thể không tồn tại' };

  const mausac = bienthe.mausac || 'Màu';
  const hinhanh = normalizeImage(bienthe.hinhanh) || normalizeImage(productdoc.hinhanh);
  const gia = bienthe.gia || productdoc.gia || 0;
  const giamgia = bienthe.phantramgiamgia != null ? bienthe.phantramgiamgia : productdoc.phantramgiamgia || 0;
  const giagiam = giamgia > 0 ? Math.round((gia * (100 - giamgia)) / 100) : gia;

  if (coSize) {
    const sizes = Array.isArray(bienthe.sizes) ? bienthe.sizes : [];
    const dongsize = sizes.find((s) => s.size === kichco);
    const tonkho = dongsize ? dongsize.soluong || 0 : 0;
    return {
      hasSize: coSize,
      stock: tonkho,
      bienTheObjId: bienthe._id,
      mausac,
      hinhanh,
      gia,
      giagiam
    };
  }

  const tonkho = bienthe.soluong || 0;
  return {
    hasSize: coSize,
    stock: tonkho,
    bienTheObjId: bienthe._id,
    mausac,
    hinhanh,
    gia,
    giagiam
  };
}

async function getOrCreateCart(userId) {
  let cart = await Giohang.findOne({ nguoidung_id: userId });
  if (!cart) cart = await Giohang.create({ nguoidung_id: userId, sanpham: [] });
  return cart;
}

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

function tinhTongTienGio(giohang) {
  if (!giohang || !Array.isArray(giohang.sanpham)) return 0;
  return giohang.sanpham.reduce((sum, item) => {
    const lineTotal = Number.isFinite(Number(item?.thanhtien))
      ? Number(item.thanhtien)
      : (Number(item?.giagiam || item?.gia || 0) * Number(item?.soluong || 1));
    return sum + Math.max(0, Number(lineTotal || 0));
  }, 0);
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

async function truTonTheoItem(item) {
  const idsanpham = item.sanpham_id;
  const idbienthe = item.bienthe_id;
  const kichco = item.kichco;
  const soluong = item.soluong || 1;

  const sanphamdoc = await sanpham.findById(idsanpham);
  if (!sanphamdoc) throw new Error('Sản phẩm không tồn tại');

  const variantId = idbienthe ? String(idbienthe) : null;
  const sizeKey = String(kichco || '').trim();
  let fifoAllocations = [];

  try {
    const fifoCost = await consumeLotsFIFO({
      productId: String(idsanpham),
      variantId,
      size: sizeKey,
      qty: soluong
    });

    fifoAllocations = Array.isArray(fifoCost?.allocations)
      ? fifoCost.allocations
        .map((a) => ({
          lotId: String(a?.lotId || ''),
          soLuong: Number(a?.soLuong || 0),
          giaNhap: Number(a?.giaNhap || 0),
          giaBanDeXuat: Number(a?.giaBanDeXuat || 0)
        }))
        .filter((a) => a.soLuong > 0)
      : [];

    const suggestedPrice = await resolveSuggestedPriceAfterConsume({
      productId: String(idsanpham),
      variantId,
      size: sizeKey,
      allocations: fifoCost?.allocations || []
    });

    applySuggestedPriceToProductDoc(sanphamdoc, {
      variantId,
      suggestedPrice
    });
  } catch {
    // Compatibility fallback: proceed with product-stock deduction when lots are legacy/incomplete.
  }

  const tonggoc = (typeof sanphamdoc.soluongton === 'number') ? sanphamdoc.soluongton : tinhTongTon(sanphamdoc);

  const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);

  if (!idbienthe) {
    if (cosize) {
      const dong = (sanphamdoc.sizes || []).find(s => s.size === kichco);
      if (!dong || dong.soluong < soluong) throw new Error('Không đủ hàng');
      dong.soluong -= soluong;
    } else {
      if ((sanphamdoc.soluong_chinh || 0) < soluong) throw new Error('Không đủ hàng');
      sanphamdoc.soluong_chinh = (sanphamdoc.soluong_chinh || 0) - soluong;
    }

    sanphamdoc.soluongton = Math.max(0, tonggoc - soluong);
    await sanphamdoc.save();
    return {
      fifoAllocations,
      fifoApplied: fifoAllocations.length > 0
    };
  }

  const bienthe = (sanphamdoc.bienthe || []).id(idbienthe);
  if (!bienthe) throw new Error('Biến thể không tồn tại');

  if (cosize) {
    const dong = (bienthe.sizes || []).find(s => s.size === kichco);
    if (!dong || dong.soluong < soluong) throw new Error('Không đủ hàng');
    dong.soluong -= soluong;
  } else {
    if ((bienthe.soluong || 0) < soluong) throw new Error('Không đủ hàng');
    bienthe.soluong = (bienthe.soluong || 0) - soluong;
  }

  sanphamdoc.soluongton = Math.max(0, tonggoc - soluong);
  await sanphamdoc.save();

  return {
    fifoAllocations,
    fifoApplied: fifoAllocations.length > 0
  };
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
  getOrCreateCart,
  normalizeImage,
  tinhSoLuongHienThiGio,
  tinhTongTienGio,
  dongBoGiaGioHang,
  truTonTheoItem,
  normalizeShippingRegion,
  calcShippingFee
};
