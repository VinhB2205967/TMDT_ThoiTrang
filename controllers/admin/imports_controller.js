const mongoose = require('mongoose');
const Sanpham = require('../../models/product_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const { NO_SIZE_TYPES, SIZE_LIST } = require('../../config/constants');
const { tinhTongTon } = require('../../services/productStock.service');
const { normalizeItems, normalizeBienTheId, tinhTongTienNhap } = require('../../helpers/importReceipt');

function laLoaiKhongSize(loaisanpham) {
  return NO_SIZE_TYPES.includes(String(loaisanpham || '').toLowerCase());
}

function laLoaiKhongSizeTheoItem(productDoc, item) {
  const productType = String(productDoc?.loaisanpham || '').toLowerCase();
  const itemCategory = String(item?.danhmuc || item?.danh_muc || '').toLowerCase();
  return laLoaiKhongSize(productType) || laLoaiKhongSize(itemCategory);
}

function taoMaPhieuNhap() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `NK${y}${m}${day}-${h}${min}${s}-${rand}`;
}

function variantKey(variantIdOrNull) {
  return variantIdOrNull ? String(variantIdOrNull) : 'main';
}

function buildStockKey(productId, variantIdOrNull, sizeKey) {
  const pid = String(productId);
  const vid = variantKey(variantIdOrNull);
  const sk = String(sizeKey || '');
  return `${pid}|${vid}|${sk}`;
}

async function findReceiptByIdOrCode(idOrCode) {
  const raw = String(idOrCode || '').trim();
  if (!raw) return null;
  if (mongoose.Types.ObjectId.isValid(raw)) {
    const docById = await PhieuNhapKho.findById(raw);
    if (docById) return docById;
  }
  return PhieuNhapKho.findOne({ maphieu: raw });
}

function applyDeltaToProductDoc(productDoc, item, deltaQty) {
  const hasSize = !laLoaiKhongSizeTheoItem(productDoc, item);
  const delta = Number(deltaQty || 0);
  if (!Number.isFinite(delta) || delta === 0) return;

  const vId = item.bientheid ? String(item.bientheid) : (item.bien_the_id ? String(item.bien_the_id) : '');
  const laChinh = !vId || vId === 'main';

  if (hasSize) {
    const size = String(item.kichco || item.kich_co || '').trim();
    if (!size) throw new Error('Thiếu size cho sản phẩm có size');

    if (laChinh) {
      productDoc.sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const dong = productDoc.sizes.find((s) => String(s.size) === size);
      const cur = Number(dong?.soluong || 0);
      const next = cur + delta;
      if (next < 0) throw new Error('Tồn kho không đủ để trừ (size chính)');
      if (dong) dong.soluong = next;
      else productDoc.sizes.push({ size, soluong: next });
    } else {
      const variant = (productDoc.bienthe || []).find((v) => String(v._id) === vId);
      if (!variant) throw new Error('Biến thể không tồn tại');
      variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
      const dong = variant.sizes.find((s) => String(s.size) === size);
      const cur = Number(dong?.soluong || 0);
      const next = cur + delta;
      if (next < 0) throw new Error('Tồn kho không đủ để trừ (size biến thể)');
      if (dong) dong.soluong = next;
      else variant.sizes.push({ size, soluong: next });
    }
  } else {
    if (laChinh) {
      const cur = Number(productDoc.soluong_chinh || 0);
      const next = cur + delta;
      if (next < 0) throw new Error('Tồn kho không đủ để trừ (sản phẩm chính)');
      productDoc.soluong_chinh = next;
    } else {
      const variant = (productDoc.bienthe || []).find((v) => String(v._id) === vId);
      if (!variant) throw new Error('Biến thể không tồn tại');
      const cur = Number(variant.soluong || 0);
      const next = cur + delta;
      if (next < 0) throw new Error('Tồn kho không đủ để trừ (biến thể)');
      variant.soluong = next;
    }
  }
}

async function apDungNhapKhoChoSanPham(productDoc, item) {
  const hasSize = !laLoaiKhongSizeTheoItem(productDoc, item);
  const qty = Number(item.soluong ?? item.so_luong ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Số lượng nhập không hợp lệ');

  const variantId = item.bientheid ? String(item.bientheid) : (item.bien_the_id ? String(item.bien_the_id) : '');
  const laChinh = !variantId || variantId === 'main';

  if (hasSize) {
    const size = String(item.kichco || item.kich_co || '').trim();
    if (!size) throw new Error('Thiếu size cho sản phẩm có size');

    if (laChinh) {
      productDoc.sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const dong = productDoc.sizes.find((s) => String(s.size) === size);
      if (dong) dong.soluong = Number(dong.soluong || 0) + qty;
      else productDoc.sizes.push({ size, soluong: qty });
    } else {
      const variant = (productDoc.bienthe || []).find((v) => String(v._id) === variantId);
      if (!variant) throw new Error('Biến thể không tồn tại');
      variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
      const dong = variant.sizes.find((s) => String(s.size) === size);
      if (dong) dong.soluong = Number(dong.soluong || 0) + qty;
      else variant.sizes.push({ size, soluong: qty });
    }
  } else {
    if (laChinh) {
      productDoc.soluong_chinh = Number(productDoc.soluong_chinh || 0) + qty;
    } else {
      const variant = (productDoc.bienthe || []).find((v) => String(v._id) === variantId);
      if (!variant) throw new Error('Biến thể không tồn tại');
      variant.soluong = Number(variant.soluong || 0) + qty;
    }
  }

  productDoc.soluongton = tinhTongTon(productDoc);
  productDoc.ngaycapnhat = new Date();
  await productDoc.save();
}

// List receipts
const danhSach = async (req, res) => {
  try {
    const receipts = await PhieuNhapKho.find({})
      .sort({ ngaytao: -1, ngay_tao: -1, created_at: -1 })
      .limit(50)
      .lean();

    res.render('admin/pages/imports/index.pug', {
      titlePage: 'Phiếu nhập kho',
      receipts
    });
  } catch (error) {
    console.error('Load import receipts error:', error);
    res.status(500).send('Không tải được danh sách phiếu nhập');
  }
};

const taoMoi = async (req, res) => {
  try {
    const products = await Sanpham.find({ daxoa: { $ne: true } })
      .sort({ ngaytao: -1 })
      .select('_id tensanpham loaisanpham gia mausac_chinh hinhanh bienthe sizes soluong_chinh')
      .lean();

    res.render('admin/pages/imports/create.pug', {
      titlePage: 'Tạo phiếu nhập kho',
      maPhieu: taoMaPhieuNhap(),
      products,
      sizeList: SIZE_LIST
    });
  } catch (error) {
    console.error('Create import receipt page error:', error);
    res.status(500).send('Không thể tải trang nhập kho');
  }
};

const taoMoiPost = async (req, res) => {
  try {
    const maphieu = String(req.body.maphieu || req.body.ma_phieu || '').trim() || taoMaPhieuNhap();
    const ngaynhap = req.body.ngaynhap ? new Date(req.body.ngaynhap) : (req.body.ngay_nhap ? new Date(req.body.ngay_nhap) : new Date());
    const nhacungcap = String(req.body.nhacungcap || req.body.nha_cung_cap || '').trim();
    const ghichu = String(req.body.ghichu || req.body.ghi_chu || '').trim();

    const items = normalizeItems(req.body.chitiet || req.body.chi_tiet || req.body.items);
    if (!items.length) {
      req.flash('error', 'Vui lòng thêm ít nhất 1 sản phẩm nhập');
      return res.redirect('back');
    }

    // Validate + snapshot display fields
    const normalizedItems = [];

    for (const raw of items) {
      const productId = String(raw.sanphamid || raw.san_pham_id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new Error('Sản phẩm không hợp lệ');
      }

      const quantity = Number(raw.soluong ?? raw.so_luong ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Số lượng nhập phải > 0');
      }

      normalizedItems.push({
        chisoblock: raw.chisoblock != null && raw.chisoblock !== '' ? Number(raw.chisoblock) : (raw.chi_so_block != null && raw.chi_so_block !== '' ? Number(raw.chi_so_block) : undefined),
        sanphamid: productId,
        tensanpham: String(raw.tensanpham || raw.ten_san_pham || '').trim(),
        masku: String(raw.masku || raw.ma_sku || '').trim(),
        danhmuc: String(raw.danhmuc || raw.danh_muc || '').trim(),
        chatlieu: String(raw.chatlieu || raw.chat_lieu || '').trim(),
        hinhanh: String(raw.hinhanh || '').trim(),
        bientheid: normalizeBienTheId(raw.bientheid || raw.bien_the_id),
        kichco: String(raw.kichco || raw.kich_co || '').trim(),
        mausac: String(raw.mausac || raw.mau_sac || '').trim(),
        soluong: quantity,
        gianhap: Number(raw.gianhap ?? raw.gia_nhap ?? 0) || 0,
        giabandexuat: Number(raw.giabandexuat ?? raw.gia_ban_de_xuat ?? 0) || 0
      });
    }

    const existed = await PhieuNhapKho.findOne({ maphieu }).select('_id').lean();
    if (existed) {
      req.flash('error', 'Mã phiếu nhập đã tồn tại, vui lòng thử lại');
      return res.redirect('back');
    }

    // Attach uploaded images (by index)
    const fileArr = Array.isArray(req.files) ? req.files : [];
    fileArr.forEach((f) => {
      const field = String(f.fieldname || '');
      const m = field.match(/^item_images\[(\d+)\]$/);
      if (!m) return;
      const idx = Number(m[1]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= normalizedItems.length) return;
      if (f.filename) {
        normalizedItems[idx].hinhanh = '/uploads/imports/' + f.filename;
      }
    });

    // Attach uploaded images by block (apply to all items in the block)
    fileArr.forEach((f) => {
      const field = String(f.fieldname || '');
      const m = field.match(/^block_images\[(\d+)\]$/);
      if (!m) return;
      const blockIdx = Number(m[1]);
      if (!Number.isInteger(blockIdx)) return;
      if (!f.filename) return;

      const url = '/uploads/imports/' + f.filename;
      normalizedItems.forEach((it) => {
        if (Number(it.chisoblock) === blockIdx) {
          it.hinhanh = url;
        }
      });
    });

    const receipt = new PhieuNhapKho({
      code: maphieu,
      maphieu,
      ma_phieu: maphieu,
      ngaynhap,
      nhacungcap,
      ghichu,
      tongtiennhap: tinhTongTienNhap(normalizedItems),
      chitiet: normalizedItems,
      nguoitao: req.user?._id || null,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    await receipt.save();

    // Apply stock changes
    for (const item of normalizedItems) {
      const productDoc = await Sanpham.findById(item.sanphamid);
      if (!productDoc) continue;
      await apDungNhapKhoChoSanPham(productDoc, item);
    }

    req.flash('success', 'Tạo phiếu nhập kho thành công và đã cộng tồn kho');
    return res.redirect(req.app.locals.admin + '/imports');
  } catch (error) {
    console.error('Create import receipt error:', error);
    req.flash('error', 'Không thể tạo phiếu nhập: ' + error.message);
    return res.redirect('back');
  }
};

const chiTiet = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const receiptDoc = await findReceiptByIdOrCode(id);
    const receipt = receiptDoc ? receiptDoc.toObject() : null;
    if (!receipt) return res.status(404).send('Không tìm thấy phiếu nhập');

    res.render('admin/pages/imports/show.pug', {
      titlePage: 'Chi tiết phiếu nhập',
      receipt
    });
  } catch (error) {
    console.error('Import receipt detail error:', error);
    res.status(500).send('Không tải được chi tiết phiếu nhập');
  }
};

const chinhSua = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const receiptDoc = await findReceiptByIdOrCode(id);
    const receipt = receiptDoc ? receiptDoc.toObject() : null;
    if (!receipt) return res.status(404).send('Không tìm thấy phiếu nhập');

    const products = await Sanpham.find({ daxoa: { $ne: true } })
      .sort({ ngaytao: -1 })
      .select('_id tensanpham loaisanpham gia mausac_chinh hinhanh bienthe sizes soluong_chinh')
      .lean();

    res.render('admin/pages/imports/edit.pug', {
      titlePage: 'Chỉnh sửa phiếu nhập',
      receipt,
      products,
      sizeList: SIZE_LIST
    });
  } catch (error) {
    console.error('Import receipt edit page error:', error);
    res.status(500).send('Không thể tải trang chỉnh sửa phiếu nhập');
  }
};

const chinhSuaPost = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const receiptDoc = await findReceiptByIdOrCode(id);
    if (!receiptDoc) {
      req.flash('error', 'Không tìm thấy phiếu nhập');
      return res.redirect(req.app.locals.admin + '/imports');
    }

    const ngaynhap = req.body.ngaynhap
      ? new Date(req.body.ngaynhap)
      : (req.body.ngay_nhap ? new Date(req.body.ngay_nhap) : (receiptDoc.ngaynhap || receiptDoc.ngay_nhap));
    const nhacungcap = String(req.body.nhacungcap || req.body.nha_cung_cap || '').trim();
    const ghichu = String(req.body.ghichu || req.body.ghi_chu || '').trim();

    const items = normalizeItems(req.body.chitiet || req.body.chi_tiet || req.body.items);
    if (!items.length) {
      req.flash('error', 'Vui lòng giữ ít nhất 1 dòng nhập');
      return res.redirect('back');
    }

    const normalizedItems = [];
    for (const raw of items) {
      const productId = String(raw.sanphamid || raw.san_pham_id || '').trim();
      if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Sản phẩm không hợp lệ');

      const quantity = Number(raw.soluong ?? raw.so_luong ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Số lượng nhập phải > 0');

      normalizedItems.push({
        sanphamid: productId,
        tensanpham: String(raw.tensanpham || raw.ten_san_pham || '').trim(),
        masku: String(raw.masku || raw.ma_sku || '').trim(),
        danhmuc: String(raw.danhmuc || raw.danh_muc || '').trim(),
        chatlieu: String(raw.chatlieu || raw.chat_lieu || '').trim(),
        hinhanh: String(raw.hinhanh || '').trim(),
        bientheid: normalizeBienTheId(raw.bientheid || raw.bien_the_id),
        kichco: String(raw.kichco || raw.kich_co || '').trim(),
        mausac: String(raw.mausac || raw.mau_sac || '').trim(),
        soluong: quantity,
        gianhap: Number(raw.gianhap ?? raw.gia_nhap ?? 0) || 0,
        giabandexuat: Number(raw.giabandexuat ?? raw.gia_ban_de_xuat ?? 0) || 0
      });
    }

    // Attach uploaded images (by index)
    const fileArr = Array.isArray(req.files) ? req.files : [];
    fileArr.forEach((f) => {
      const field = String(f.fieldname || '');
      const m = field.match(/^item_images\[(\d+)\]$/);
      if (!m) return;
      const idx = Number(m[1]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= normalizedItems.length) return;
      if (f.filename) normalizedItems[idx].hinhanh = '/uploads/imports/' + f.filename;
    });

    // Build product docs map once
    const allProductIds = new Set();
    (receiptDoc.chitiet || receiptDoc.chi_tiet || []).forEach((it) => allProductIds.add(String(it.sanphamid || it.san_pham_id)));
    normalizedItems.forEach((it) => allProductIds.add(String(it.sanphamid)));
    const ids = Array.from(allProductIds).filter((x) => mongoose.Types.ObjectId.isValid(x));

    const productDocs = await Sanpham.find({ _id: { $in: ids } });
    const productDocMap = new Map(productDocs.map((p) => [String(p._id), p]));

    // Quantities by key (old vs new)
    const oldQty = new Map();
    const newQty = new Map();
    const keyMeta = new Map();

    function addQty(targetMap, pid, vidOrNull, sizeKey, qty, meta) {
      const key = buildStockKey(pid, vidOrNull, sizeKey);
      targetMap.set(key, Number(targetMap.get(key) || 0) + Number(qty || 0));
      if (!keyMeta.has(key) && meta) keyMeta.set(key, meta);
    }

    // Old
    for (const it of receiptDoc.chitiet || receiptDoc.chi_tiet || []) {
      const product = productDocMap.get(String(it.sanphamid || it.san_pham_id));
      if (!product) continue;
      const hasSize = !laLoaiKhongSizeTheoItem(product, it);
      const sizeKey = hasSize ? String(it.kichco || it.kich_co || '').trim() : '';
      addQty(oldQty, it.sanphamid || it.san_pham_id, it.bientheid || it.bien_the_id || null, sizeKey, it.soluong ?? it.so_luong ?? 0, {
        sanphamid: String(it.sanphamid || it.san_pham_id),
        bientheid: it.bientheid || it.bien_the_id || null,
        size: sizeKey
      });
    }

    // New
    for (const it of normalizedItems) {
      const product = productDocMap.get(String(it.sanphamid));
      if (!product) throw new Error('Sản phẩm không tồn tại');
      const hasSize = !laLoaiKhongSizeTheoItem(product, it);
      const sizeKey = hasSize ? String(it.kichco || '').trim() : '';
      if (hasSize && !sizeKey) throw new Error('Thiếu size cho sản phẩm có size');
      addQty(newQty, it.sanphamid, it.bientheid || null, sizeKey, it.soluong, {
        sanphamid: String(it.sanphamid),
        bientheid: it.bientheid || null,
        size: sizeKey
      });
    }

    // Apply deltas grouped by product
    const deltaByProduct = new Map();
    const allKeys = new Set([...oldQty.keys(), ...newQty.keys()]);
    for (const key of allKeys) {
      const d = Number(newQty.get(key) || 0) - Number(oldQty.get(key) || 0);
      if (!d) continue;
      const meta = keyMeta.get(key);
      if (!meta) continue;
      const pid = String(meta.sanphamid);
      if (!deltaByProduct.has(pid)) deltaByProduct.set(pid, []);
      deltaByProduct.get(pid).push({
        bientheid: meta.bientheid ? String(meta.bientheid) : 'main',
        size: meta.size,
        delta: d
      });
    }

    for (const [pid, deltas] of deltaByProduct.entries()) {
      const productDoc = productDocMap.get(String(pid));
      if (!productDoc) continue;

      for (const d of deltas) {
        applyDeltaToProductDoc(productDoc, { bientheid: d.bientheid, kichco: d.size }, d.delta);
      }

      productDoc.soluongton = tinhTongTon(productDoc);
      productDoc.ngaycapnhat = new Date();
      await productDoc.save();
    }

    const ensuredCode = receiptDoc.maphieu || receiptDoc.ma_phieu || taoMaPhieuNhap();
    if (!receiptDoc.code) receiptDoc.code = ensuredCode;
    if (!receiptDoc.maphieu) receiptDoc.maphieu = ensuredCode;
    if (!receiptDoc.ma_phieu) receiptDoc.ma_phieu = ensuredCode;
    receiptDoc.ngaynhap = ngaynhap;
    receiptDoc.nhacungcap = nhacungcap;
    receiptDoc.ghichu = ghichu;
    receiptDoc.tongtiennhap = tinhTongTienNhap(normalizedItems);
    receiptDoc.chitiet = normalizedItems;
    receiptDoc.ngaycapnhat = new Date();
    await receiptDoc.save();

    req.flash('success', 'Đã cập nhật phiếu nhập và điều chỉnh tồn kho theo chênh lệch');
    return res.redirect(req.app.locals.admin + '/imports/' + receiptDoc._id);
  } catch (error) {
    console.error('Import receipt edit save error:', error);
    req.flash('error', 'Không thể lưu chỉnh sửa: ' + error.message);
    return res.redirect('back');
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chiTiet,
  chinhSua,
  chinhSuaPost
};
