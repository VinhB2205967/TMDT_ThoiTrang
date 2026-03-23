const mongoose = require('mongoose');
const Sanpham = require('../../models/product_model');
const PhieuDieuChinhKho = require('../../models/inventory_adjustment_model');
const { SIZE_LIST } = require('../../config/constants');
const { tinhTongTon } = require('../catalog/productStock.service');
const { normalizeItems, normalizeBienTheId } = require('../../helpers/importReceipt');
const inventoryService = require('./inventory.service');
const fifoService = require('./fifo.service');

function taoMaPhieuDieuChinh() {
  return `ADJ-${Date.now()}`;
}

function layDuongDanAdjustments({ adminPrefix = '/admin', subPath = '' } = {}) {
  const base = String(adminPrefix || '/admin').replace(/\/$/, '');
  const tail = String(subPath || '').replace(/^\//, '');
  return tail ? `${base}/adjustments/${tail}` : `${base}/adjustments`;
}

function xacDinhLoaiFlashKetQua(result) {
  return result && result.ok ? 'success' : 'error';
}

function xacDinhLoaiPhieuTheoChiTiet(items = []) {
  const signs = items.map((it) => Math.sign(Number(it.soluongdieuchinh || 0))).filter((s) => s !== 0);
  const hasIncrease = signs.includes(1);
  const hasDecrease = signs.includes(-1);
  if (hasIncrease && hasDecrease) return 'mixed';
  return hasIncrease ? 'increase' : 'decrease';
}

async function findByIdOrCode(idOrCode) {
  const raw = String(idOrCode || '').trim();
  if (!raw) return null;
  if (mongoose.Types.ObjectId.isValid(raw)) {
    const byId = await PhieuDieuChinhKho.findById(raw);
    if (byId) return byId;
  }
  return PhieuDieuChinhKho.findOne({ maphieu: raw });
}

function chuanHoaChiTiet(rawItems = []) {
  const normalized = [];
  for (const raw of rawItems) {
    const productId = String(raw.sanphamid || raw.san_pham_id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Sản phẩm không hợp lệ');

    const delta = Number(raw.soluongdieuchinh ?? raw.so_luong_dieu_chinh ?? raw.soluong ?? 0);
    if (!Number.isFinite(delta) || delta === 0) throw new Error('Số lượng điều chỉnh phải khác 0');

    normalized.push({
      sanphamid: productId,
      tensanpham: String(raw.tensanpham || raw.ten_san_pham || '').trim(),
      bientheid: normalizeBienTheId(raw.bientheid || raw.bien_the_id),
      kichco: String(raw.kichco || raw.kich_co || '').trim(),
      mausac: String(raw.mausac || raw.mau_sac || '').trim(),
      soluongdieuchinh: delta,
      tontruoc: null,
      tonsau: null
    });
  }
  return normalized;
}

async function getDanhSachData() {
  const receipts = await PhieuDieuChinhKho.find({})
    .sort({ ngaytao: -1 })
    .limit(100)
    .lean();

  return {
    titlePage: 'Phiếu điều chỉnh kho',
    receipts
  };
}

async function getTaoMoiData() {
  const products = await Sanpham.find({ daxoa: { $ne: true } })
    .sort({ ngaytao: -1 })
    .select('_id tensanpham loaisanpham mausac_chinh bienthe sizes soluong_chinh')
    .lean();

  return {
    titlePage: 'Tạo phiếu điều chỉnh kho',
    maPhieu: taoMaPhieuDieuChinh(),
    products,
    sizeList: SIZE_LIST
  };
}

async function taoMoiPhieuDieuChinh({ body = {}, adminUser = null, user = null }) {
  const maphieu = String(body.maphieu || '').trim() || taoMaPhieuDieuChinh();
  const lydo = String(body.lydo || '').trim();
  const rawItems = normalizeItems(body.chitiet || body.chi_tiet || body.items);
  if (!rawItems.length) return { ok: false, message: 'Vui lòng thêm ít nhất 1 dòng điều chỉnh' };

  const details = chuanHoaChiTiet(rawItems);
  const productIds = Array.from(new Set(details
    .map((it) => String(it.sanphamid || ''))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))));
  if (productIds.length) {
    const products = await Sanpham.find({ _id: { $in: productIds } })
      .select('_id tensanpham')
      .lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    details.forEach((line) => {
      if (line.tensanpham) return;
      line.tensanpham = productMap.get(String(line.sanphamid || ''))?.tensanpham || '';
    });
  }

  const loai = xacDinhLoaiPhieuTheoChiTiet(details);
  if (loai === 'mixed') {
    return {
      ok: false,
      message: 'Một phiếu chỉ hỗ trợ một loại điều chỉnh (+ hoặc -). Vui lòng tách thành 2 phiếu riêng.'
    };
  }

  const existed = await PhieuDieuChinhKho.findOne({ maphieu }).select('_id').lean();
  if (existed) return { ok: false, message: 'Mã phiếu điều chỉnh đã tồn tại' };

  const doc = new PhieuDieuChinhKho({
    maphieu,
    loaiphieu: loai,
    lydo,
    daxacnhan: false,
    chitiet: details,
    nguoitao: adminUser?._id || user?._id || null,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  await doc.save();

  return {
    ok: true,
    message: 'Tạo phiếu điều chỉnh thành công. Vui lòng xác nhận để cập nhật tồn kho.',
    receiptId: doc._id
  };
}

async function getChiTietData(idOrCode) {
  const receiptDoc = await findByIdOrCode(idOrCode);
  if (!receiptDoc) return { ok: false, message: 'Không tìm thấy phiếu điều chỉnh' };

  if (receiptDoc.nguoitao) {
    await receiptDoc.populate({ path: 'nguoitao', select: 'hoten email avatar' });
  }
  if (receiptDoc.nguoixacnhan) {
    await receiptDoc.populate({ path: 'nguoixacnhan', select: 'hoten email avatar' });
  }

  const receipt = receiptDoc.toObject();
  const details = Array.isArray(receipt.chitiet) ? receipt.chitiet : [];
  const productIds = Array.from(new Set(details
    .map((it) => String(it.sanphamid || ''))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))));

  if (productIds.length) {
    const products = await Sanpham.find({ _id: { $in: productIds } })
      .select('_id tensanpham loaisanpham mausac_chinh bienthe sizes soluong_chinh')
      .lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    receipt.chitiet = details.map((line) => {
      const product = productMap.get(String(line.sanphamid || ''));
      const out = {
        ...line,
        tensanpham: line.tensanpham || product?.tensanpham || String(line.sanphamid || '')
      };

      if (!product) return out;

      const resolved = inventoryService.resolveVariant(product, out);
      out.bientheten = resolved.isMain
        ? 'Mặc định'
        : (resolved.variant?.mausac ? `Biến thể: ${resolved.variant.mausac}` : 'Biến thể');

      if (!out.mausac) {
        out.mausac = resolved.isMain
          ? String(product.mausac_chinh || '')
          : String(resolved.variant?.mausac || '');
      }

      try {
        const tonHienTai = inventoryService.readCurrentStock(product, out, resolved);
        out.tonhientai = tonHienTai;
        const delta = Number(out.soluongdieuchinh || 0);
        out.tonsau_dukien = tonHienTai + (Number.isFinite(delta) ? delta : 0);
      } catch (_) {
        // Keep legacy values when size/variant data is not sufficient for preview.
      }

      return out;
    });
  }

  return {
    ok: true,
    data: {
      titlePage: 'Chi tiết phiếu điều chỉnh kho',
      receipt
    }
  };
}

async function xacNhanPhieuDieuChinh({ idOrCode, adminUser = null, user = null }) {
  const receiptDoc = await findByIdOrCode(idOrCode);
  if (!receiptDoc) return { ok: false, message: 'Không tìm thấy phiếu điều chỉnh' };

  if (receiptDoc.daxacnhan) {
    return { ok: true, message: 'Phiếu đã được xác nhận trước đó', receiptId: receiptDoc._id };
  }

  const details = Array.isArray(receiptDoc.chitiet) ? receiptDoc.chitiet : [];
  if (!details.length) {
    return { ok: false, message: 'Phiếu điều chỉnh không có chi tiết', receiptId: receiptDoc._id };
  }

  const productIds = Array.from(new Set(details
    .map((it) => String(it.sanphamid || ''))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))));

  const productDocs = await Sanpham.find({ _id: { $in: productIds } });
  const productDocMap = new Map(productDocs.map((p) => [String(p._id), p]));
  const touched = new Set();

  for (const line of details) {
    const pid = String(line.sanphamid || '').trim();
    const productDoc = productDocMap.get(pid);
    if (!productDoc) {
      return {
        ok: false,
        message: 'Có sản phẩm trong phiếu không còn tồn tại',
        receiptId: receiptDoc._id
      };
    }

    const delta = Number(line.soluongdieuchinh || 0);
    if (!Number.isFinite(delta) || delta === 0) {
      return { ok: false, message: 'Dòng điều chỉnh không hợp lệ', receiptId: receiptDoc._id };
    }

    try {
      if (delta > 0) {
        await fifoService.tangLayerFIFO({ receiptDoc, productDoc, line, delta });
      } else {
        await fifoService.giamLayerFIFO({ productDoc, line, delta });
      }

      const result = inventoryService.applyAdjustmentToProductDoc(productDoc, line, delta);
      line.tontruoc = result.before;
      line.tonsau = result.after;
      if (!line.tensanpham) line.tensanpham = productDoc.tensanpham || '';
      if (!line.mausac && result.color) line.mausac = result.color;
    } catch (error) {
      return {
        ok: false,
        message: error.message || 'Không thể xác nhận điều chỉnh kho',
        receiptId: receiptDoc._id
      };
    }

    touched.add(pid);
  }

  for (const pid of touched) {
    const productDoc = productDocMap.get(pid);
    if (!productDoc) continue;
    productDoc.soluongton = tinhTongTon(productDoc);
    productDoc.ngaycapnhat = new Date();
    await productDoc.save();
  }

  receiptDoc.chitiet = details;
  receiptDoc.daxacnhan = true;
  receiptDoc.ngayxacnhan = new Date();
  receiptDoc.nguoixacnhan = adminUser?._id || user?._id || null;
  receiptDoc.ngaycapnhat = new Date();
  await receiptDoc.save();

  return {
    ok: true,
    message: 'Đã xác nhận phiếu điều chỉnh và cập nhật tồn kho thành công',
    receiptId: receiptDoc._id
  };
}

module.exports = {
  layDuongDanAdjustments,
  xacDinhLoaiFlashKetQua,
  getDanhSachData,
  getTaoMoiData,
  taoMoiPhieuDieuChinh,
  getChiTietData,
  xacNhanPhieuDieuChinh
};
