const mongoose = require('mongoose');
const Sanpham = require('../../models/product_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
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

function taoKhoaDongDieuChinh({ sanphamid, bientheid, kichco }) {
  const productId = String(sanphamid || '').trim();
  const variantId = normalizeBienTheId(bientheid) || 'main';
  const sizeKey = String(kichco || '').trim();
  return `${productId}|${String(variantId)}|${sizeKey}`;
}

function lapBanDoDongTheoPhieuNhap(receiptDoc) {
  const map = new Map();
  const details = normalizeItems(receiptDoc?.chitiet || receiptDoc?.chi_tiet || receiptDoc?.items);

  for (const raw of details) {
    const productId = String(raw?.sanphamid || raw?.san_pham_id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) continue;

    const variantId = normalizeBienTheId(raw?.bientheid || raw?.bien_the_id);
    const sizeKey = String(raw?.kichco || raw?.kich_co || '').trim();
    const key = taoKhoaDongDieuChinh({
      sanphamid: productId,
      bientheid: variantId,
      kichco: sizeKey
    });

    const existed = map.get(key);
    if (existed) {
      existed.soluongnhap += Number(raw?.soluong || raw?.so_luong || 0) || 0;
      if (!existed.mausac) existed.mausac = String(raw?.mausac || raw?.mau_sac || '').trim();
      if (!existed.tensanpham) existed.tensanpham = String(raw?.tensanpham || raw?.ten_san_pham || '').trim();
      continue;
    }

    map.set(key, {
      key,
      sanphamid: productId,
      bientheid: variantId || null,
      kichco: sizeKey,
      mausac: String(raw?.mausac || raw?.mau_sac || '').trim(),
      tensanpham: String(raw?.tensanpham || raw?.ten_san_pham || '').trim(),
      soluongnhap: Number(raw?.soluong || raw?.so_luong || 0) || 0
    });
  }

  return map;
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
  const sourceReceipts = await PhieuNhapKho.find({ daxuatkho: true })
    .sort({ ngayxuatkho: -1, ngaynhap: -1, ngaytao: -1, _id: -1 })
    .limit(200)
    .select('_id maphieu ma_phieu code nhacungcap ngaynhap ngayxuatkho loaiphieu chitiet')
    .lean();

  const receiptItemsById = {};
  const importReceipts = [];
  const productIdSet = new Set();

  for (const receipt of sourceReceipts) {
    const receiptId = String(receipt?._id || '').trim();
    if (!receiptId) continue;

    const lineMap = lapBanDoDongTheoPhieuNhap(receipt);
    const lines = Array.from(lineMap.values());
    if (!lines.length) continue;

    lines.forEach((line) => productIdSet.add(String(line.sanphamid)));
    receiptItemsById[receiptId] = lines;
    importReceipts.push({
      _id: receiptId,
      maphieu: String(receipt.maphieu || receipt.ma_phieu || receipt.code || '').trim(),
      nhacungcap: String(receipt.nhacungcap || '').trim(),
      ngaynhap: receipt.ngaynhap || null,
      ngayxuatkho: receipt.ngayxuatkho || null,
      loaiphieu: String(receipt.loaiphieu || 'standard').trim(),
      soDong: lines.length
    });
  }

  const productIds = Array.from(productIdSet).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const products = await Sanpham.find({ _id: { $in: productIds }, daxoa: { $ne: true } })
    .sort({ tensanpham: 1, _id: 1 })
    .select('_id tensanpham loaisanpham mausac_chinh bienthe sizes soluong_chinh')
    .lean();

  const productMap = new Map(products.map((p) => [String(p._id), p]));
  Object.keys(receiptItemsById).forEach((receiptId) => {
    const rows = Array.isArray(receiptItemsById[receiptId]) ? receiptItemsById[receiptId] : [];
    rows.forEach((line) => {
      const product = productMap.get(String(line.sanphamid || ''));
      if (!line.tensanpham) line.tensanpham = product?.tensanpham || '';

      if (!line.mausac && product) {
        const variantId = line.bientheid ? String(line.bientheid) : '';
        if (variantId && variantId !== 'main') {
          const variant = (Array.isArray(product.bienthe) ? product.bienthe : [])
            .find((v) => String(v._id) === variantId);
          line.mausac = String(variant?.mausac || '').trim();
        } else {
          line.mausac = String(product.mausac_chinh || '').trim();
        }
      }
    });

    rows.sort((a, b) => {
      const an = String(a.tensanpham || '').localeCompare(String(b.tensanpham || ''), 'vi');
      if (an !== 0) return an;
      const av = String(a.bientheid || 'main').localeCompare(String(b.bientheid || 'main'));
      if (av !== 0) return av;
      return String(a.kichco || '').localeCompare(String(b.kichco || ''), 'vi');
    });
  });

  return {
    titlePage: 'Tạo phiếu điều chỉnh kho',
    maPhieu: taoMaPhieuDieuChinh(),
    products,
    sizeList: SIZE_LIST,
    importReceipts,
    receiptItemsById
  };
}
async function taoMoiPhieuDieuChinh({ body = {}, adminUser = null, user = null }) {
  const maphieu = String(body.maphieu || '').trim() || taoMaPhieuDieuChinh();
  const lydo = String(body.lydo || '').trim();
  const phieuNhapId = String(body.phieunhapid || body.phieu_nhap_id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(phieuNhapId)) {
    return { ok: false, message: 'Vui lòng chọn phiếu nhập hợp lệ' };
  }

  const sourceReceipt = await PhieuNhapKho.findOne({ _id: phieuNhapId, daxuatkho: true })
    .select('_id maphieu ma_phieu code chitiet')
    .lean();
  if (!sourceReceipt) {
    return { ok: false, message: 'Không tìm thấy phiếu nhập để tham chiếu' };
  }

  const allowedLineMap = lapBanDoDongTheoPhieuNhap(sourceReceipt);
  if (!allowedLineMap.size) {
    return { ok: false, message: 'Phiếu nhập này không có dòng sản phẩm hợp lệ để điều chỉnh' };
  }

  const rawItems = normalizeItems(body.chitiet || body.chi_tiet || body.items);
  if (!rawItems.length) return { ok: false, message: 'Vui lòng thêm ít nhất 1 dòng điều chỉnh' };

  const details = chuanHoaChiTiet(rawItems);
  const seenKeys = new Set();
  for (const line of details) {
    const key = taoKhoaDongDieuChinh(line);
    const allowed = allowedLineMap.get(key);
    if (!allowed) {
      return {
        ok: false,
        message: 'Chỉ được chọn sản phẩm/biến thể/size thuộc phiếu nhập đã chọn'
      };
    }

    line.sanphamid = allowed.sanphamid;
    line.bientheid = allowed.bientheid || null;
    line.kichco = allowed.kichco || '';
    if (!line.tensanpham) line.tensanpham = allowed.tensanpham || '';
    if (!line.mausac) line.mausac = allowed.mausac || '';

    const normalizedKey = taoKhoaDongDieuChinh({
      sanphamid: line.sanphamid,
      bientheid: line.bientheid,
      kichco: line.kichco
    });
    if (seenKeys.has(normalizedKey)) {
      return {
        ok: false,
        message: 'Không được chọn trùng sản phẩm/biến thể/size trong cùng một phiếu điều chỉnh'
      };
    }
    seenKeys.add(normalizedKey);
  }

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

  const existed = await PhieuDieuChinhKho.findOne({ maphieu }).select('_id').lean();
  if (existed) return { ok: false, message: 'Mã phiếu điều chỉnh đã tồn tại' };

  const doc = new PhieuDieuChinhKho({
    maphieu,
    phieunhapid: sourceReceipt._id,
    maphieunhap: String(sourceReceipt.maphieu || sourceReceipt.ma_phieu || sourceReceipt.code || '').trim(),
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
  if (receiptDoc.phieunhapid) {
    await receiptDoc.populate({ path: 'phieunhapid', select: 'maphieu ma_phieu code nhacungcap ngaynhap' });
  }

  const receipt = receiptDoc.toObject();
  if (!receipt.maphieunhap && receipt.phieunhapid) {
    receipt.maphieunhap = String(
      receipt.phieunhapid.maphieu || receipt.phieunhapid.ma_phieu || receipt.phieunhapid.code || ''
    ).trim();
  }
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
  const seenKeys = new Set();
  for (const line of details) {
    const key = taoKhoaDongDieuChinh(line);
    if (seenKeys.has(key)) {
      return {
        ok: false,
        message: 'Phiếu có dòng sản phẩm/biến thể/size bị trùng, vui lòng xóa phiếu và tạo lại',
        receiptId: receiptDoc._id
      };
    }
    seenKeys.add(key);
  }

  const productIds = Array.from(new Set(details
    .map((it) => String(it.sanphamid || ''))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))));

  const productDocs = await Sanpham.find({ _id: { $in: productIds } });
  const productDocMap = new Map(productDocs.map((p) => [String(p._id), p]));
  const touched = new Set();

  // Validate all lines on a snapshot first so we do not apply FIFO partially
  // when any later line would make stock go negative.
  const simulatedProductMap = new Map(productDocs.map((p) => [
    String(p._id),
    typeof p.toObject === 'function' ? p.toObject() : JSON.parse(JSON.stringify(p))
  ]));

  for (const line of details) {
    const pid = String(line.sanphamid || '').trim();
    const simulatedDoc = simulatedProductMap.get(pid);
    if (!simulatedDoc) {
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
      inventoryService.applyAdjustmentToProductDoc(simulatedDoc, line, delta);
    } catch (error) {
      return {
        ok: false,
        message: error.message || 'Không thể xác nhận điều chỉnh kho',
        receiptId: receiptDoc._id
      };
    }
  }

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

async function xoaPhieuDieuChinh(idOrCode) {
  const receiptDoc = await findByIdOrCode(idOrCode);
  if (!receiptDoc) return { ok: false, message: 'Không tìm thấy phiếu điều chỉnh' };

  if (receiptDoc.daxacnhan) {
    return {
      ok: false,
      message: 'Phiếu đã được xác nhận, không thể xóa',
      receiptId: receiptDoc._id
    };
  }

  await PhieuDieuChinhKho.deleteOne({ _id: receiptDoc._id });

  return {
    ok: true,
    message: 'Đã xóa phiếu điều chỉnh',
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
  xacNhanPhieuDieuChinh,
  xoaPhieuDieuChinh
};
