const mongoose = require('mongoose');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const { SIZE_LIST } = require('../../config/constants');
const { tinhTongTon } = require('../../services/catalog/productStock.service.js');
const {
  tinhTongSoLieu,
  tinhTaiChinhTheoPhanBo,
  taoBanDoGiaVonTrungBinhTheoSanPham,
  xuatTonTheoLoFIFO,
  layGiaDeXuatSauKhiXuat,
  apDungGiaDeXuatChoSanPham,
  layGiaVonTrungBinh,
  taoThongTinNhanVienKy,
  taoMaPhieuXuat,
  truTonKhoTheoDong
} = require('./exportReceipt.service.js');

function buildLineKey({ sanphamid, bientheid, kichco }) {
  const productId = String(sanphamid || '').trim();
  const variantId = bientheid ? String(bientheid).trim() : 'main';
  const sizeKey = String(kichco || '').trim();
  return `${productId}|${variantId}|${sizeKey}`;
}

function isLegacyAllocationLine(line) {
  const allocs = Array.isArray(line?.allocations) ? line.allocations : [];
  if (!allocs.length) return true;
  return allocs.every((a) => !a?.lotId);
}

async function hydrateLegacyOrderAllocations(receipt) {
  if (!receipt || !receipt.donhang_id) return receipt;

  const orderId = typeof receipt.donhang_id === 'object' && receipt.donhang_id._id
    ? String(receipt.donhang_id._id)
    : String(receipt.donhang_id);
  if (!mongoose.Types.ObjectId.isValid(orderId)) return receipt;

  const orderItems = await Chitietdonhang.find({ donhang_id: orderId })
    .select('sanpham_id bienthe_id kichco giagoc giaban fifoAllocations')
    .lean();
  if (!Array.isArray(orderItems) || !orderItems.length) return receipt;

  const itemBuckets = new Map();
  for (const it of orderItems) {
    const key = buildLineKey({
      sanphamid: it.sanpham_id,
      bientheid: it.bienthe_id,
      kichco: it.kichco
    });
    const arr = itemBuckets.get(key) || [];
    arr.push(it);
    itemBuckets.set(key, arr);
  }

  const lines = Array.isArray(receipt.chitiet) ? receipt.chitiet : [];
  for (const line of lines) {
    if (!isLegacyAllocationLine(line)) continue;

    const key = buildLineKey({
      sanphamid: line.sanphamid,
      bientheid: line.bientheid,
      kichco: line.kichco
    });
    const bucket = itemBuckets.get(key) || [];
    if (!bucket.length) continue;

    const orderItem = bucket.shift();
    itemBuckets.set(key, bucket);

    const allocs = Array.isArray(orderItem.fifoAllocations)
      ? orderItem.fifoAllocations
        .map((a) => ({
          lotId: a?.lotId || null,
          soLuong: Number(a?.soLuong || 0),
          giaNhap: Number(a?.giaNhap || 0),
          giaBanDeXuat: Number(a?.giaBanDeXuat || 0)
        }))
        .filter((a) => a.soLuong > 0)
      : [];
    if (!allocs.length) continue;

    const fallbackGiaBan = Number(orderItem.giagoc || line.giaban || 0);
    const fallbackGiam = fallbackGiaBan > 0
      ? Math.max(0, Number((((fallbackGiaBan - Number(orderItem.giaban || fallbackGiaBan)) / fallbackGiaBan) * 100).toFixed(2)))
      : 0;

    const finance = tinhTaiChinhTheoPhanBo({
      allocations: allocs,
      fallbackGiaBan,
      fallbackPhanTramGiam: fallbackGiam
    });

    line.allocations = finance.allocations;
    line.gianhap = finance.gianhap;
    line.giaban = finance.giaban;
    line.phantramgiam = finance.phantramgiam;
    line.giasaugiam = finance.giasaugiam;
    line.doanhthu = finance.tongDoanhThu;
    line.giavon = finance.tongGiaVon;
    line.loinhuan = finance.tongLoiNhuan;
  }

  return receipt;
}

function normalizeItems(bodyItems) {
  if (!bodyItems) return [];
  if (Array.isArray(bodyItems)) return bodyItems;
  return [bodyItems];
}

function normalizeBienTheId(raw) {
  const v = String(raw || '').trim();
  if (!v || v === 'main') return null;
  return v;
}

async function findExportByIdOrCode(idOrCode) {
  const raw = String(idOrCode || '').trim();
  if (!raw) return null;
  if (mongoose.Types.ObjectId.isValid(raw)) {
    const doc = await PhieuXuatKho.findById(raw);
    if (doc) return doc;
  }
  return PhieuXuatKho.findOne({ maphieu: raw });
}

async function getDanhSachData() {
  const receipts = await PhieuXuatKho.find({})
    .sort({ ngaytao: -1 })
    .limit(50)
    .populate('donhang_id', 'madonhang')
    .lean();

  return { ok: true, status: 200, data: receipts };
}

async function getDanhSachViewData() {
  const result = await getDanhSachData();
  return {
    titlePage: 'Phiếu xuất kho',
    receipts: result.data || []
  };
}

async function getTaoMoiData() {
  const products = await Sanpham.find({ daxoa: { $ne: true } })
    .sort({ ngaytao: -1 })
    .select('_id tensanpham loaisanpham gia mausac_chinh hinhanh bienthe sizes soluong_chinh')
    .lean();

  return {
    ok: true,
    status: 200,
    data: {
      maPhieu: taoMaPhieuXuat(),
      products,
      sizeList: SIZE_LIST
    }
  };
}

async function getTaoMoiViewData() {
  const result = await getTaoMoiData();
  return {
    titlePage: 'Tạo phiếu xuất kho',
    maPhieu: result.data.maPhieu,
    products: result.data.products,
    sizeList: result.data.sizeList
  };
}

async function taoPhieuXuat({ body = {}, adminUser = null, user = null }) {
  const maphieu = String(body.maphieu || '').trim() || taoMaPhieuXuat();
  const ngayxuat = body.ngayxuat ? new Date(body.ngayxuat) : new Date();
  const noinhan = String(body.noinhan || '').trim();
  const lydo = String(body.lydo || '').trim();

  const itemsRaw = normalizeItems(body.chitiet || body.items);
  if (!itemsRaw.length) {
    return { ok: false, status: 400, message: 'Vui lòng thêm ít nhất 1 dòng xuất kho', code: 'EMPTY_ITEMS' };
  }

  const existedCode = await PhieuXuatKho.findOne({ maphieu }).select('_id').lean();
  if (existedCode) {
    return { ok: false, status: 409, message: 'Mã phiếu xuất đã tồn tại, vui lòng thử lại', code: 'DUPLICATE_CODE' };
  }

  const normalizedItems = [];
  for (const raw of itemsRaw) {
    const productId = String(raw.sanphamid || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return { ok: false, status: 400, message: 'Sản phẩm không hợp lệ', code: 'INVALID_PRODUCT' };
    }

    const qty = Number(raw.soluong || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, status: 400, message: 'Số lượng xuất phải > 0', code: 'INVALID_QTY' };
    }

    normalizedItems.push({
      sanphamid: productId,
      tensanpham: String(raw.tensanpham || '').trim(),
      bientheid: normalizeBienTheId(raw.bientheid),
      kichco: String(raw.kichco || '').trim(),
      mausac: String(raw.mausac || '').trim(),
      soluong: qty,
      hinhanh: String(raw.hinhanh || '').trim(),
      ghichudong: String(raw.ghichudong || '').trim()
    });
  }

  const productIds = Array.from(new Set(normalizedItems.map((it) => String(it.sanphamid)).filter((id) => mongoose.Types.ObjectId.isValid(id))));
  const costMap = await taoBanDoGiaVonTrungBinhTheoSanPham(productIds);

  for (const it of normalizedItems) {
    const productDoc = await Sanpham.findById(it.sanphamid);
    if (!productDoc) return { ok: false, status: 404, message: 'Sản phẩm không tồn tại', code: 'PRODUCT_NOT_FOUND' };

    const variantId = it.bientheid ? String(it.bientheid) : null;
    const variant = variantId ? (productDoc.bienthe || []).find((v) => String(v._id) === variantId) : null;

    if (!it.tensanpham) it.tensanpham = productDoc.tensanpham || '';
    if (!it.mausac) it.mausac = !it.bientheid ? (productDoc.mausac_chinh || '') : (variant && variant.mausac ? variant.mausac : '');
    if (!it.hinhanh) {
      it.hinhanh = !it.bientheid
        ? String(productDoc.hinhanh || '')
        : String((variant && variant.hinhanh) || productDoc.hinhanh || '');
    }

    const giaBan = variant ? Number(variant.gia || productDoc.gia || 0) : Number(productDoc.gia || 0);
    const phanTramGiam = variant
      ? Number(variant.phantramgiamgia ?? productDoc.phantramgiamgia ?? 0)
      : Number(productDoc.phantramgiamgia || 0);

    let fifoCost;
    let suggestedPrice = 0;
    try {
      fifoCost = await xuatTonTheoLoFIFO({
        productId: it.sanphamid,
        variantId,
        size: it.kichco,
        qty: it.soluong
      });

      suggestedPrice = await layGiaDeXuatSauKhiXuat({
        productId: it.sanphamid,
        variantId,
        size: it.kichco,
        allocations: fifoCost.allocations
      });
    } catch (fifoErr) {
      const giaNhapFallback = layGiaVonTrungBinh(costMap, {
        productId: it.sanphamid,
        variantId,
        size: it.kichco
      });
      fifoCost = {
        tongGiaVon: Number(it.soluong || 0) * giaNhapFallback,
        giaNhapBinhQuan: giaNhapFallback
      };

      suggestedPrice = variant ? Number(variant.gia || productDoc.gia || 0) : Number(productDoc.gia || 0);
    }

    truTonKhoTheoDong(productDoc, {
      variantId,
      size: it.kichco,
      qty: it.soluong
    });

    apDungGiaDeXuatChoSanPham(productDoc, { variantId, suggestedPrice });

    productDoc.soluongton = tinhTongTon(productDoc);
    productDoc.ngaycapnhat = new Date();
    await productDoc.save();

    const fallbackAllocations = fifoCost.allocations && fifoCost.allocations.length
      ? fifoCost.allocations
      : [{ soLuong: Number(it.soluong || 0), giaNhap: fifoCost.giaNhapBinhQuan, giaBanDeXuat: giaBan }];

    const allocationFinance = tinhTaiChinhTheoPhanBo({
      allocations: fallbackAllocations,
      fallbackGiaBan: giaBan,
      fallbackPhanTramGiam: phanTramGiam
    });

    it.gianhap = allocationFinance.gianhap;
    it.giaban = allocationFinance.giaban;
    it.phantramgiam = allocationFinance.phantramgiam;
    it.giasaugiam = allocationFinance.giasaugiam;
    it.doanhthu = allocationFinance.tongDoanhThu;
    it.giavon = allocationFinance.tongGiaVon;
    it.loinhuan = allocationFinance.tongLoiNhuan;
    it.allocations = allocationFinance.allocations;
  }

  const totals = tinhTongSoLieu(normalizedItems);

  const receipt = new PhieuXuatKho({
    maphieu,
    ngayxuat,
    noinhan,
    lydo,
    ...totals,
    nguoitaophieu: 'manual',
    chitiet: normalizedItems,
    nhanvienky: taoThongTinNhanVienKy(adminUser || user),
    nguoitao: (adminUser && adminUser._id) || (user && user._id) || null,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  await receipt.save();

  return {
    ok: true,
    status: 201,
    message: 'Tạo phiếu xuất kho thành công',
    data: receipt
  };
}

async function getChiTietData(idOrCode) {
  const receiptDoc = await findExportByIdOrCode(idOrCode);
  if (!receiptDoc) return { ok: false, status: 404, message: 'Không tìm thấy phiếu xuất kho', code: 'NOT_FOUND' };

  if (receiptDoc.nguoitao) {
    await receiptDoc.populate({ path: 'nguoitao', select: 'hoten email avatar' });
  }
  if (receiptDoc.donhang_id) {
    await receiptDoc.populate({ path: 'donhang_id', select: 'madonhang' });
  }

  const receipt = await hydrateLegacyOrderAllocations(receiptDoc.toObject());
  const nhanVienKy = {
    tennhanvien: (receipt.nhanvienky && receipt.nhanvienky.tennhanvien) || (receipt.nguoitao && receipt.nguoitao.hoten) || (receipt.nguoitao && receipt.nguoitao.email) || '',
    idnhanvien: (receipt.nhanvienky && receipt.nhanvienky.idnhanvien) || (receipt.nguoitao && receipt.nguoitao._id ? String(receipt.nguoitao._id) : ''),
    anhchuky: (receipt.nhanvienky && receipt.nhanvienky.anhchuky) || (receipt.nguoitao && receipt.nguoitao.avatar) || '',
    thoigianky: (receipt.nhanvienky && receipt.nhanvienky.thoigianky) || receipt.ngaytao || null
  };

  return { ok: true, status: 200, data: { receipt, nhanVienKy } };
}

async function getChiTietViewData(idOrCode) {
  const result = await getChiTietData(idOrCode);
  if (!result.ok) return result;

  return {
    ok: true,
    status: 200,
    data: {
      titlePage: 'Chi tiết phiếu xuất',
      receipt: result.data.receipt,
      nhanVienKy: result.data.nhanVienKy
    }
  };
}

module.exports = {
  getDanhSachData,
  getDanhSachViewData,
  getTaoMoiData,
  getTaoMoiViewData,
  taoPhieuXuat,
  getChiTietData,
  getChiTietViewData
};
