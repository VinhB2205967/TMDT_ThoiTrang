const mongoose = require('mongoose');
const Sanpham = require('../../models/product_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const TonKhoLo = require('../../models/inventory_lot_model');
const { NO_SIZE_TYPES, SIZE_LIST } = require('../../config/constants');
const { tinhTongTon } = require('../../services/productStock.service');
const { normalizeItems, normalizeBienTheId, tinhTongTienNhap } = require('../../helpers/importReceipt');
const paginationHelper = require('../../helpers/pagination');

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

function taoThongTinNhanVienKy(req, fallback = {}) {
  const adminUser = req.adminUser || req.user || null;
  const tenNhanVien = String(
    fallback.tennhanvien
      || adminUser?.hoten
      || adminUser?.name
      || adminUser?.email
      || ''
  ).trim();
  const idNhanVien = String(
    fallback.idnhanvien
      || adminUser?._id
      || ''
  ).trim();
  const anhChuKy = String(
    fallback.anhchuky
      || adminUser?.chukyso
      || adminUser?.chuKy
      || adminUser?.avatar
      || ''
  ).trim();

  return {
    tennhanvien: tenNhanVien,
    idnhanvien: idNhanVien,
    anhchuky: anhChuKy,
    thoigianky: fallback.thoigianky || new Date()
  };
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

function normalizeLotSize(productDoc, item) {
  const hasSize = !laLoaiKhongSizeTheoItem(productDoc, item);
  if (!hasSize) return '';
  return String(item.kichco || item.kich_co || '').trim();
}

async function taoLoNhapChoPhieu({ receiptDoc, items, productDocMap }) {
  const docs = [];
  for (const item of (items || [])) {
    const productId = String(item.sanphamid || item.san_pham_id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) continue;
    const productDoc = productDocMap.get(productId);
    if (!productDoc) continue;

    const qty = Number(item.soluong ?? item.so_luong ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const variantId = normalizeBienTheId(item.bientheid || item.bien_the_id);
    const variantObjectId = variantId && mongoose.Types.ObjectId.isValid(String(variantId))
      ? new mongoose.Types.ObjectId(String(variantId))
      : null;
    const sizeKey = normalizeLotSize(productDoc, item);

    docs.push({
      phieunhap_id: receiptDoc._id,
      maphieunhap: String(receiptDoc.maphieu || receiptDoc.ma_phieu || receiptDoc.code || ''),
      ngaynhap: receiptDoc.ngaynhap || new Date(),
      nhacungcap: String(receiptDoc.nhacungcap || ''),
      sanphamid: new mongoose.Types.ObjectId(productId),
      bientheid: variantObjectId,
      kichco: sizeKey,
      mausac: String(item.mausac || item.mau_sac || ''),
      gianhap: Number(item.gianhap ?? item.gia_nhap ?? 0) || 0,
      giabandexuat: Number(item.giabandexuat ?? item.gia_ban_de_xuat ?? 0) || 0,
      soluongnhap: qty,
      soluongconlai: qty,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });
  }

  if (docs.length) {
    await TonKhoLo.insertMany(docs);
  }
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
  let laChinh = !vId || vId === 'main';
  let variant = null;
  if (!laChinh) {
    variant = (productDoc.bienthe || []).find((v) => String(v._id) === vId) || null;
    if (!variant) {
      laChinh = true;
    }
  }

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
      const cur = Number(variant.soluong || 0);
      const next = cur + delta;
      if (next < 0) throw new Error('Tồn kho không đủ để trừ (biến thể)');
      variant.soluong = next;
    }
  }
}

function capNhatGiaBanDeXuatChoSanPham(productDoc, item) {
  const giaBanDeXuat = Number(item.giabandexuat ?? item.gia_ban_de_xuat ?? 0);
  if (!Number.isFinite(giaBanDeXuat) || giaBanDeXuat <= 0) return false;

  const variantId = item.bientheid ? String(item.bientheid) : (item.bien_the_id ? String(item.bien_the_id) : '');
  const laChinh = !variantId || variantId === 'main';

  if (laChinh) {
    if (Number(productDoc.gia || 0) === giaBanDeXuat) return false;
    productDoc.gia = giaBanDeXuat;
    return true;
  }

  const variant = (productDoc.bienthe || []).find((v) => String(v._id) === variantId);
  if (!variant) throw new Error('Biến thể không tồn tại');

  if (Number(variant.gia || 0) === giaBanDeXuat) return false;
  variant.gia = giaBanDeXuat;
  return true;
}

function taoDieuKienBienTheChoLo(variantId) {
  const normalized = normalizeBienTheId(variantId);
  if (!normalized) {
    return {
      $or: [
        { bientheid: null },
        { bientheid: { $exists: false } }
      ]
    };
  }

  if (!mongoose.Types.ObjectId.isValid(String(normalized))) {
    return null;
  }

  return { bientheid: new mongoose.Types.ObjectId(String(normalized)) };
}

async function coTonLoConLai({ productDoc, item, excludeReceiptId = null }) {
  const productId = String(item.sanphamid || item.san_pham_id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(productId)) return false;

  const variantCondition = taoDieuKienBienTheChoLo(item.bientheid || item.bien_the_id);
  if (!variantCondition) return false;

  const sizeKey = normalizeLotSize(productDoc, item);
  const query = {
    sanphamid: new mongoose.Types.ObjectId(productId),
    kichco: String(sizeKey || ''),
    soluongconlai: { $gt: 0 },
    ...variantCondition
  };

  if (excludeReceiptId && mongoose.Types.ObjectId.isValid(String(excludeReceiptId))) {
    query.phieunhap_id = { $ne: new mongoose.Types.ObjectId(String(excludeReceiptId)) };
  }

  const lot = await TonKhoLo.findOne(query).select('_id').lean();
  return !!lot;
}

async function laLoDauFIFOConTon({ receiptId, productDoc, item }) {
  const productId = String(item.sanphamid || item.san_pham_id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(productId)) return false;
  if (!mongoose.Types.ObjectId.isValid(String(receiptId || ''))) return false;

  const variantCondition = taoDieuKienBienTheChoLo(item.bientheid || item.bien_the_id);
  if (!variantCondition) return false;

  const sizeKey = normalizeLotSize(productDoc, item);

  const oldestLot = await TonKhoLo.findOne({
    sanphamid: new mongoose.Types.ObjectId(productId),
    kichco: String(sizeKey || ''),
    soluongconlai: { $gt: 0 },
    ...variantCondition
  })
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 })
    .select('phieunhap_id')
    .lean();

  if (!oldestLot || !oldestLot.phieunhap_id) return false;
  return String(oldestLot.phieunhap_id) === String(receiptId);
}


// List receipts
const danhSach = async (req, res) => {
  try {
    const supplier = String(req.query.supplier || '').trim();
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(5, limitRaw)) : 10;

    const filter = {};
    if (supplier) {
      filter.$or = [
        { nhacungcap: { $regex: supplier, $options: 'i' } },
        { nha_cung_cap: { $regex: supplier, $options: 'i' } },
        { supplier: { $regex: supplier, $options: 'i' } }
      ];
    }

    const totalReceipts = await PhieuNhapKho.countDocuments(filter);
    let pagination = { currentPage: 1, limit };
    pagination = paginationHelper(pagination, req.query, totalReceipts);

    const receipts = await PhieuNhapKho.find(filter)
      .sort({ ngaytao: -1, ngay_tao: -1, created_at: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();

    res.render('admin/pages/imports/index.pug', {
      titlePage: 'Phiếu nhập kho',
      receipts,
      filters: {
        supplier,
        limit
      },
      pagination
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
      return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/imports/create'));
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
      return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/imports/create'));
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
      nhanvienky: taoThongTinNhanVienKy(req),
      nguoitao: req.adminUser?._id || req.user?._id || null,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    await receipt.save();

    const productIds = Array.from(new Set(normalizedItems
      .map((it) => String(it.sanphamid || ''))
      .filter((it) => mongoose.Types.ObjectId.isValid(it))));
    const productDocs = await Sanpham.find({ _id: { $in: productIds } });
    const productDocMap = new Map(productDocs.map((p) => [String(p._id), p]));

    await taoLoNhapChoPhieu({
      receiptDoc: receipt,
      items: normalizedItems,
      productDocMap
    });

    req.flash('success', 'Tạo phiếu nhập kho thành công');
    return res.redirect(req.app.locals.admin + '/imports');
  } catch (error) {
    console.error('Create import receipt error:', error);
    req.flash('error', 'Không thể tạo phiếu nhập: ' + error.message);
    return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/imports/create'));
  }
};

const chiTiet = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const receiptDoc = await findReceiptByIdOrCode(id);
    if (receiptDoc && receiptDoc.nguoitao) {
      await receiptDoc.populate({ path: 'nguoitao', select: 'hoten email avatar' });
    }

    const receipt = receiptDoc ? receiptDoc.toObject() : null;
    if (!receipt) return res.status(404).send('Không tìm thấy phiếu nhập');

    const nhanVienKy = {
      tennhanvien: receipt?.nhanvienky?.tennhanvien || receipt?.nguoitao?.hoten || receipt?.nguoitao?.email || '',
      idnhanvien: receipt?.nhanvienky?.idnhanvien || (receipt?.nguoitao?._id ? String(receipt.nguoitao._id) : ''),
      anhchuky: receipt?.nhanvienky?.anhchuky || receipt?.nguoitao?.avatar || '',
      thoigianky: receipt?.nhanvienky?.thoigianky || receipt?.ngaytao || null
    };

    res.render('admin/pages/imports/show.pug', {
      titlePage: 'Chi tiết phiếu nhập',
      receipt,
      nhanVienKy
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
      return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/imports/' + receiptDoc._id + '/edit'));
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

    const usedLots = await TonKhoLo.find({ phieunhap_id: receiptDoc._id })
      .select('soluongnhap soluongconlai')
      .lean();
    const daPhatSinhXuat = usedLots.some((lot) => Number(lot.soluongconlai || 0) < Number(lot.soluongnhap || 0));
    if (daPhatSinhXuat) {
      req.flash('error', 'Phiếu nhập đã phát sinh xuất kho theo FIFO nên không thể chỉnh sửa');
      return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/imports/' + receiptDoc._id + '/edit'));
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
    if (!receiptDoc.nhanvienky || !receiptDoc.nhanvienky.thoigianky) {
      receiptDoc.nhanvienky = taoThongTinNhanVienKy(req, receiptDoc.nhanvienky || {});
    }
    receiptDoc.ngaycapnhat = new Date();
    await receiptDoc.save();

    const productIds = Array.from(new Set(normalizedItems
      .map((it) => String(it.sanphamid || ''))
      .filter((it) => mongoose.Types.ObjectId.isValid(it))));
    const productDocs = await Sanpham.find({ _id: { $in: productIds } });
    const productDocMap = new Map(productDocs.map((p) => [String(p._id), p]));

    await TonKhoLo.deleteMany({ phieunhap_id: receiptDoc._id });
    await taoLoNhapChoPhieu({
      receiptDoc,
      items: normalizedItems,
      productDocMap
    });

    req.flash('success', 'Đã cập nhật phiếu nhập');
    return res.redirect(req.app.locals.admin + '/imports/' + receiptDoc._id);
  } catch (error) {
    console.error('Import receipt edit save error:', error);
    req.flash('error', 'Không thể lưu chỉnh sửa: ' + error.message);
    return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/imports/' + req.params.id + '/edit'));
  }
};

const xoaPhieu = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const receiptDoc = await findReceiptByIdOrCode(id);
    if (!receiptDoc) {
      req.flash('error', 'Không tìm thấy phiếu nhập');
      return res.redirect(req.app.locals.admin + '/imports');
    }

    const lots = await TonKhoLo.find({ phieunhap_id: receiptDoc._id })
      .select('soluongnhap soluongconlai')
      .lean();
    const daPhatSinhXuat = lots.some((lot) => Number(lot.soluongconlai || 0) < Number(lot.soluongnhap || 0));

    if (daPhatSinhXuat) {
      req.flash('error', 'Không thể xóa phiếu nhập vì đã phát sinh xuất kho theo FIFO');
      return res.redirect(req.app.locals.admin + '/imports/' + receiptDoc._id);
    }

    await TonKhoLo.deleteMany({ phieunhap_id: receiptDoc._id });
    await PhieuNhapKho.deleteOne({ _id: receiptDoc._id });

    req.flash('success', 'Đã xóa phiếu nhập thành công');
    return res.redirect(req.app.locals.admin + '/imports');
  } catch (error) {
    console.error('Delete import receipt error:', error);
    req.flash('error', 'Không thể xóa phiếu nhập: ' + error.message);
    return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/imports'));
  }
};

const xuatKhoPhieuPost = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const receiptDoc = await findReceiptByIdOrCode(id);
    if (!receiptDoc) {
      req.flash('error', 'Không tìm thấy phiếu nhập');
      return res.redirect(req.app.locals.admin + '/imports');
    }

    if (receiptDoc.daxuatkho) {
      req.flash('error', 'Phiếu nhập này đã được xuất kho trước đó');
      return res.redirect(req.app.locals.admin + '/imports/' + receiptDoc._id);
    }

    const items = normalizeItems(receiptDoc.chitiet || receiptDoc.chi_tiet || receiptDoc.items);
    if (!items.length) {
      req.flash('error', 'Phiếu nhập không có dòng sản phẩm để xuất kho');
      return res.redirect(req.app.locals.admin + '/imports/' + receiptDoc._id);
    }

    const productIds = Array.from(new Set(items
      .map((it) => String(it.sanphamid || it.san_pham_id || ''))
      .filter((x) => mongoose.Types.ObjectId.isValid(x))));

    const productDocs = await Sanpham.find({ _id: { $in: productIds } });
    const productDocMap = new Map(productDocs.map((p) => [String(p._id), p]));

    const touchedProductIds = new Set();

    for (const it of items) {
      const pid = String(it.sanphamid || it.san_pham_id || '').trim();
      const productDoc = productDocMap.get(pid);
      if (!productDoc) continue;

      const qty = Number(it.soluong ?? it.so_luong ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      applyDeltaToProductDoc(productDoc, {
        bientheid: it.bientheid || it.bien_the_id || 'main',
        kichco: it.kichco || it.kich_co || ''
      }, qty);

      const shouldUpdatePrice = await laLoDauFIFOConTon({
        receiptId: receiptDoc._id,
        productDoc,
        item: it
      });

      if (shouldUpdatePrice) {
        capNhatGiaBanDeXuatChoSanPham(productDoc, it);
      }
      touchedProductIds.add(pid);
    }

    for (const pid of touchedProductIds) {
      const productDoc = productDocMap.get(String(pid));
      if (!productDoc) continue;
      productDoc.soluongton = tinhTongTon(productDoc);
      productDoc.ngaycapnhat = new Date();
      await productDoc.save();
    }

    receiptDoc.daxuatkho = true;
    receiptDoc.ngayxuatkho = new Date();
    receiptDoc.nguoixuatkho = req.adminUser?._id || req.user?._id || null;
    receiptDoc.ngaycapnhat = new Date();
    await receiptDoc.save();

    req.flash('success', 'Đã xuất kho phiếu nhập: cập nhật số lượng và giá cho sản phẩm');
    return res.redirect(req.app.locals.admin + '/imports/' + receiptDoc._id);
  } catch (error) {
    console.error('Export import receipt error:', error);
    req.flash('error', 'Không thể xuất kho phiếu nhập: ' + error.message);
    return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/imports'));
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chiTiet,
  chinhSua,
  chinhSuaPost,
  xoaPhieu,
  xuatKhoPhieuPost
};
