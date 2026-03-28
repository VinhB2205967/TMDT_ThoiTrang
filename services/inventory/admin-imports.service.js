const mongoose = require('mongoose');
const Sanpham = require('../../models/product_model');
const Chitietdonhang = require('../../models/order_item_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const TonKhoLo = require('../../models/inventory_lot_model');
const { NO_SIZE_TYPES, SIZE_LIST } = require('../../config/constants');
const { tinhTongTon } = require('../catalog/productStock.service.js');
const { getCategoryTree } = require('../catalog/category.service.js');
const { normalizeItems, normalizeBienTheId, tinhTongTienNhap } = require('../../helpers/importReceipt');
const { chuanIdNhanVienHienThi } = require('../../helpers/user-display-id');
const paginationHelper = require('../../helpers/pagination');

async function layDanhSachDanhMucNhapKho() {
  const tree = await getCategoryTree({ type: 'category', isActive: true });
  const options = [];

  const flattenChildren = (nodes = []) => {
    for (const node of nodes) {
      if (!node) continue;
      if (node.parent_id) {
        options.push({
          _id: node._id,
          slug: String(node.slug || '').trim(),
          name: String(node.name || node.tendanhmuc || node.slug || '').trim(),
          level: Number(node.level || 1)
        });
      }
      if (Array.isArray(node.children) && node.children.length) {
        flattenChildren(node.children);
      }
    }
  };

  flattenChildren(tree);
  return options.filter((item) => item.slug && item.name);
}

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

function layDuongDanImports({ adminPrefix = '/admin', subPath = '' } = {}) {
  const base = String(adminPrefix || '/admin').replace(/\/$/, '');
  const tail = String(subPath || '').replace(/^\//, '');
  return tail ? `${base}/imports/${tail}` : `${base}/imports`;
}

function xacDinhLoaiFlashKetQua(result) {
  return result && result.ok ? 'success' : 'error';
}

function taoThongTinNhanVienKy({ adminUser, user }, fallback = {}) {
  const actor = adminUser || user || null;
  const tenNhanVien = String(
    fallback.tennhanvien
      || actor?.hoten
      || actor?.name
      || actor?.email
      || ''
  ).trim();
  const idNhanVienRaw = String(
    fallback.idnhanvien
      || actor?._id
      || ''
  ).trim();
  const idNhanVien = chuanIdNhanVienHienThi({
    rawId: idNhanVienRaw,
    createdAt: actor?.ngaytao || fallback.thoigianky || new Date()
  });
  const anhChuKy = String(
    fallback.anhchuky
      || actor?.chukyso
      || actor?.chuKy
      || actor?.avatar
      || ''
  ).trim();

  return {
    tennhanvien: tenNhanVien,
    idnhanvien: idNhanVien,
    anhchuky: anhChuKy,
    thoigianky: fallback.thoigianky || new Date()
  };
}

function normalizeLotSize(productDoc, item) {
  const hasSize = !laLoaiKhongSizeTheoItem(productDoc, item);
  if (!hasSize) return '';
  return String(item.kichco || item.kich_co || '').trim();
}

function layGiaHienTaiTuSanPham(productDoc, item) {
  if (!productDoc) return 0;

  const variantId = normalizeBienTheId(item?.bientheid || item?.bien_the_id);
  if (!variantId) return Number(productDoc.gia || 0);

  const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
  if (!variant) return Number(productDoc.gia || 0);

  return Number(variant.gia != null ? variant.gia : productDoc.gia || 0);
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
    const giaBanHienTai = layGiaHienTaiTuSanPham(productDoc, item);

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
      giabandexuat: giaBanHienTai > 0
        ? giaBanHienTai
        : (Number(item.giabandexuat ?? item.gia_ban_de_xuat ?? 0) || 0),
      soluongnhap: qty,
      soluongconlai: qty,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });
  }

  if (docs.length) await TonKhoLo.insertMany(docs);
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
    if (!variant) laChinh = true;
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
  } else if (laChinh) {
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

function capNhatGiaBanDeXuatChoSanPham(productDoc, item) {
  const giaBanDeXuat = Number(item.giabandexuat ?? item.gia_ban_de_xuat ?? 0);
  if (!Number.isFinite(giaBanDeXuat) || giaBanDeXuat <= 0) return false;

  const variantId = item.bientheid ? String(item.bientheid) : (item.bien_the_id ? String(item.bien_the_id) : '');
  const mauSac = String(item.mausac || item.mau_sac || '').trim().toLowerCase();
  let laChinh = !variantId || variantId === 'main';
  let variant = null;

  if (!laChinh) {
    variant = (productDoc.bienthe || []).find((v) => String(v._id) === variantId) || null;
    if (!variant) throw new Error('Biến thể không tồn tại');
  } else if (mauSac) {
    variant = (productDoc.bienthe || []).find((v) => String(v.mausac || '').trim().toLowerCase() === mauSac) || null;
    if (variant) laChinh = false;
  }

  if (laChinh) {
    if (Number(productDoc.gia || 0) === giaBanDeXuat) return false;
    productDoc.gia = giaBanDeXuat;
    return true;
  }

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

  if (!mongoose.Types.ObjectId.isValid(String(normalized))) return null;
  return { bientheid: new mongoose.Types.ObjectId(String(normalized)) };
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

async function capNhatGiaTheoLoFIFOHienTai({ productDoc, item }) {
  const productId = String(item.sanphamid || item.san_pham_id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(productId)) return false;

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
    .select('giabandexuat')
    .lean();

  const giaBanDeXuat = Number(oldestLot?.giabandexuat || 0);
  if (!Number.isFinite(giaBanDeXuat) || giaBanDeXuat <= 0) return false;

  return capNhatGiaBanDeXuatChoSanPham(productDoc, {
    ...item,
    giabandexuat: giaBanDeXuat
  });
}

function ganAnhNhapKhoTheoFile(items, files) {
  const arr = Array.isArray(items) ? items : [];
  const fileArr = Array.isArray(files) ? files : [];

  fileArr.forEach((f) => {
    const field = String(f.fieldname || '');
    const m = field.match(/^item_images\[(\d+)\]$/);
    if (!m) return;
    const idx = Number(m[1]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) return;
    if (f.filename) arr[idx].hinhanh = `/uploads/imports/${f.filename}`;
  });

  fileArr.forEach((f) => {
    const field = String(f.fieldname || '');
    const m = field.match(/^block_images\[(\d+)\]$/);
    if (!m) return;
    const blockIdx = Number(m[1]);
    if (!Number.isInteger(blockIdx) || !f.filename) return;
    const url = `/uploads/imports/${f.filename}`;
    arr.forEach((it) => {
      if (Number(it.chisoblock) === blockIdx) it.hinhanh = url;
    });
  });

  return arr;
}

function chuanHoaChiTietNhap(items, productDocMap = new Map()) {
  const normalizedItems = [];
  for (const raw of (items || [])) {
    const productId = String(raw.sanphamid || raw.san_pham_id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Sản phẩm không hợp lệ');

    const quantity = Number(raw.soluong ?? raw.so_luong ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Số lượng nhập phải > 0');

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
  return normalizedItems;
}

function chuanHoaChiTietNhapTheoGiaSanPham(items, productDocMap = new Map()) {
  return chuanHoaChiTietNhap(items, productDocMap).map((item) => {
    const productDoc = productDocMap.get(String(item.sanphamid || '').trim());
    const giaBanHienTai = layGiaHienTaiTuSanPham(productDoc, item);

    return {
      ...item,
      giabandexuat: giaBanHienTai > 0 ? giaBanHienTai : Number(item.giabandexuat || 0)
    };
  });
}

async function taoBanDoSanPhamChoChiTietNhap(items = []) {
  const productIds = Array.from(new Set((items || [])
    .map((raw) => String(raw?.sanphamid || raw?.san_pham_id || '').trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))));

  if (!productIds.length) return new Map();

  const productDocs = await Sanpham.find({ _id: { $in: productIds } })
    .select('_id gia bienthe')
    .lean();
  return new Map(productDocs.map((productDoc) => [String(productDoc._id), productDoc]));
}

function taoKhoaDongKho({ sanphamid, bientheid, kichco }) {
  const productId = String(sanphamid || '').trim();
  const variantId = bientheid ? String(bientheid).trim() : 'main';
  const sizeKey = String(kichco || '').trim();
  return `${productId}|${variantId}|${sizeKey}`;
}

async function tachDongPhieuNhapHoanTheoFifo(receipt) {
  if (!receipt || String(receipt.loaiphieu || '') !== 'return') return receipt;

  const orderId = String(receipt.donhang_id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(orderId)) return receipt;

  const items = await Chitietdonhang.find({ donhang_id: orderId })
    .select('sanpham_id bienthe_id kichco fifoAllocations')
    .lean();
  if (!Array.isArray(items) || !items.length) return receipt;

  const slotMap = new Map();
  for (const it of items) {
    const key = taoKhoaDongKho({
      sanphamid: it.sanpham_id,
      bientheid: it.bienthe_id,
      kichco: it.kichco
    });
    const slots = slotMap.get(key) || [];
    const allocs = Array.isArray(it.fifoAllocations) ? it.fifoAllocations : [];
    for (const a of allocs) {
      const qty = Number(a?.soLuong || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      slots.push({
        remaining: qty,
        gianhap: Number(a?.giaNhap || 0),
        giabandexuat: Number(a?.giaBanDeXuat || 0)
      });
    }
    slotMap.set(key, slots);
  }

  const originalDetails = Array.isArray(receipt.chitiet) ? receipt.chitiet : [];
  const expanded = [];

  for (const line of originalDetails) {
    const key = taoKhoaDongKho({
      sanphamid: line.sanphamid,
      bientheid: line.bientheid,
      kichco: line.kichco
    });

    const slots = slotMap.get(key) || [];
    let remainQty = Number(line.soluong || 0);

    while (remainQty > 0 && slots.length) {
      const slot = slots[0];
      const slotRemain = Number(slot.remaining || 0);
      if (slotRemain <= 0) {
        slots.shift();
        continue;
      }

      const take = Math.min(remainQty, slotRemain);
      expanded.push({
        ...line,
        soluong: take,
        gianhap: Number.isFinite(slot.gianhap) && slot.gianhap > 0 ? slot.gianhap : Number(line.gianhap || 0),
        giabandexuat: Number.isFinite(slot.giabandexuat) && slot.giabandexuat > 0 ? slot.giabandexuat : Number(line.giabandexuat || 0)
      });

      slot.remaining = slotRemain - take;
      remainQty -= take;
      if (slot.remaining <= 0) slots.shift();
    }

    if (remainQty > 0) {
      expanded.push({
        ...line,
        soluong: remainQty
      });
    }

    slotMap.set(key, slots);
  }

  return {
    ...receipt,
    chitiet: expanded
  };
}

async function getDanhSachData(query = {}) {
  const supplier = String(query.supplier || '').trim();
  const limitRaw = parseInt(query.limit, 10);
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
  pagination = paginationHelper(pagination, query, totalReceipts);

  const receipts = await PhieuNhapKho.find(filter)
    .sort({ ngaytao: -1, ngay_tao: -1, created_at: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  return {
    titlePage: 'Phiếu nhập kho',
    receipts,
    filters: { supplier, limit },
    pagination
  };
}

async function getTaoMoiData() {
  const [products, categoryOptions] = await Promise.all([
    Sanpham.find({ daxoa: { $ne: true } })
      .sort({ ngaytao: -1 })
      .select('_id tensanpham loaisanpham gia mausac_chinh hinhanh bienthe sizes soluong_chinh')
      .lean(),
    layDanhSachDanhMucNhapKho()
  ]);

  return {
    titlePage: 'Tạo phiếu nhập kho',
    maPhieu: taoMaPhieuNhap(),
    products,
    categoryOptions,
    sizeList: SIZE_LIST
  };
}

async function taoMoiPhieuNhap({ body, files, adminUser, user }) {
  const maphieu = String(body.maphieu || body.ma_phieu || '').trim() || taoMaPhieuNhap();
  const ngaynhap = body.ngaynhap ? new Date(body.ngaynhap) : (body.ngay_nhap ? new Date(body.ngay_nhap) : new Date());
  const nhacungcap = String(body.nhacungcap || body.nha_cung_cap || '').trim();
  const ghichu = String(body.ghichu || body.ghi_chu || '').trim();

  const items = normalizeItems(body.chitiet || body.chi_tiet || body.items);
  if (!items.length) return { ok: false, message: 'Vui lòng thêm ít nhất 1 sản phẩm nhập' };

  const productDocMap = await taoBanDoSanPhamChoChiTietNhap(items);
  const normalizedItems = ganAnhNhapKhoTheoFile(chuanHoaChiTietNhapTheoGiaSanPham(items, productDocMap), files);

  const existed = await PhieuNhapKho.findOne({ maphieu }).select('_id').lean();
  if (existed) return { ok: false, message: 'Mã phiếu nhập đã tồn tại, vui lòng thử lại' };

  const receipt = new PhieuNhapKho({
    code: maphieu,
    maphieu,
    ma_phieu: maphieu,
    ngaynhap,
    nhacungcap,
    ghichu,
    tongtiennhap: tinhTongTienNhap(normalizedItems),
    chitiet: normalizedItems,
    daxuatkho: false,
    ngayxuatkho: null,
    nguoixuatkho: null,
    nhanvienky: taoThongTinNhanVienKy({ adminUser, user }),
    nguoitao: adminUser?._id || user?._id || null,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  await receipt.save();

  return {
    ok: true,
    message: 'Tạo phiếu nhập kho thành công. Vui lòng xác nhận nhập kho để cộng tồn sản phẩm.',
    receiptId: receipt._id
  };
}

async function getChiTietData(id) {
  const receiptDoc = await findReceiptByIdOrCode(id);
  if (receiptDoc && receiptDoc.nguoitao) {
    await receiptDoc.populate({ path: 'nguoitao', select: 'hoten email avatar chukyso ngaytao' });
  }

  let receipt = receiptDoc ? receiptDoc.toObject() : null;
  if (!receipt) return { ok: false, message: 'Không tìm thấy phiếu nhập' };

  receipt = await tachDongPhieuNhapHoanTheoFifo(receipt);

  const idNhanVienRaw = receipt?.nhanvienky?.idnhanvien || (receipt?.nguoitao?._id ? String(receipt.nguoitao._id) : '');
  const nhanVienKy = {
    tennhanvien: receipt?.nhanvienky?.tennhanvien || receipt?.nguoitao?.hoten || receipt?.nguoitao?.email || '',
    idnhanvien: chuanIdNhanVienHienThi({
      rawId: idNhanVienRaw,
      createdAt: receipt?.nguoitao?.ngaytao || receipt?.nhanvienky?.thoigianky || receipt?.ngaytao || new Date()
    }),
    anhdaidien: receipt?.nguoitao?.avatar || '/images/avatar/avatar.png',
    anhchuky: receipt?.nhanvienky?.anhchuky || receipt?.nguoitao?.chukyso || receipt?.nguoitao?.avatar || '',
    thoigianky: receipt?.nhanvienky?.thoigianky || receipt?.ngaytao || null
  };

  return {
    ok: true,
    data: {
      titlePage: 'Chi tiết phiếu nhập',
      receipt,
      nhanVienKy
    }
  };
}

async function getChinhSuaData(id) {
  const receiptDoc = await findReceiptByIdOrCode(id);
  let receipt = receiptDoc ? receiptDoc.toObject() : null;
  if (!receipt) return { ok: false, message: 'Không tìm thấy phiếu nhập' };

  if (String(receipt.loaiphieu || '') === 'return') {
    return {
      ok: false,
      code: 'READ_ONLY_RETURN',
      message: 'Phiếu nhập hoàn trả được tạo tự động theo FIFO, không cho chỉnh sửa.',
      receiptId: receipt._id
    };
  }

  if (receipt.daxuatkho) {
    return {
      ok: false,
      code: 'READ_ONLY_CONFIRMED',
      message: 'Phiếu nhập đã xác nhận nhập kho, không cho chỉnh sửa.',
      receiptId: receipt._id
    };
  }

  receipt = await tachDongPhieuNhapHoanTheoFifo(receipt);

  const [products, categoryOptions] = await Promise.all([
    Sanpham.find({ daxoa: { $ne: true } })
      .sort({ ngaytao: -1 })
      .select('_id tensanpham loaisanpham gia mausac_chinh hinhanh bienthe sizes soluong_chinh')
      .lean(),
    layDanhSachDanhMucNhapKho()
  ]);

  return {
    ok: true,
    data: {
      titlePage: 'Chỉnh sửa phiếu nhập',
      receipt,
      products,
      categoryOptions,
      sizeList: SIZE_LIST
    }
  };
}

async function chinhSuaPhieuNhap({ id, body, files, adminUser, user }) {
  const receiptDoc = await findReceiptByIdOrCode(id);
  if (!receiptDoc) return { ok: false, message: 'Không tìm thấy phiếu nhập' };

  if (String(receiptDoc.loaiphieu || '') === 'return') {
    return {
      ok: false,
      message: 'Phiếu nhập hoàn trả được tạo tự động theo FIFO, không hỗ trợ chỉnh sửa thủ công.',
      receiptId: receiptDoc._id
    };
  }

  if (receiptDoc.daxuatkho) {
    return {
      ok: false,
      code: 'READ_ONLY_CONFIRMED',
      message: 'Phiếu nhập đã xác nhận nhập kho, không cho chỉnh sửa.',
      receiptId: receiptDoc._id
    };
  }

  const ngaynhap = body.ngaynhap
    ? new Date(body.ngaynhap)
    : (body.ngay_nhap ? new Date(body.ngay_nhap) : (receiptDoc.ngaynhap || receiptDoc.ngay_nhap));
  const nhacungcap = String(body.nhacungcap || body.nha_cung_cap || '').trim();
  const ghichu = String(body.ghichu || body.ghi_chu || '').trim();

  const items = normalizeItems(body.chitiet || body.chi_tiet || body.items);
  if (!items.length) return { ok: false, message: 'Vui lòng giữ ít nhất 1 dòng nhập', receiptId: receiptDoc._id };

  const productDocMap = await taoBanDoSanPhamChoChiTietNhap(items);
  const normalizedItems = ganAnhNhapKhoTheoFile(chuanHoaChiTietNhapTheoGiaSanPham(items, productDocMap), files);

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
    receiptDoc.nhanvienky = taoThongTinNhanVienKy({ adminUser, user }, receiptDoc.nhanvienky || {});
  }
  receiptDoc.ngaycapnhat = new Date();
  await receiptDoc.save();

  // Phiếu chưa xác nhận nhập kho không giữ lô FIFO và chưa cộng tồn.
  await TonKhoLo.deleteMany({ phieunhap_id: receiptDoc._id });

  return { ok: true, message: 'Đã cập nhật phiếu nhập', receiptId: receiptDoc._id };
}

async function xoaPhieuNhap(id) {
  const receiptDoc = await findReceiptByIdOrCode(id);
  if (!receiptDoc) return { ok: false, message: 'Không tìm thấy phiếu nhập' };

  if (receiptDoc.daxuatkho) {
    return {
      ok: false,
      message: 'Phiếu nhập đã xác nhận nhập kho, không thể xóa.',
      receiptId: receiptDoc._id
    };
  }

  const lots = await TonKhoLo.find({ phieunhap_id: receiptDoc._id })
    .select('soluongnhap soluongconlai')
    .lean();
  const daPhatSinhXuat = lots.some((lot) => Number(lot.soluongconlai || 0) < Number(lot.soluongnhap || 0));

  if (daPhatSinhXuat) {
    return {
      ok: false,
      message: 'Không thể xóa phiếu nhập vì đã phát sinh xuất kho theo FIFO',
      receiptId: receiptDoc._id
    };
  }

  const items = normalizeItems(receiptDoc.chitiet || receiptDoc.chi_tiet || receiptDoc.items);
  const productIds = Array.from(new Set(items
    .map((it) => String(it.sanphamid || it.san_pham_id || ''))
    .filter((x) => mongoose.Types.ObjectId.isValid(x))));
  const productDocs = await Sanpham.find({ _id: { $in: productIds } });
  const productDocMap = new Map(productDocs.map((p) => [String(p._id), p]));
  const touchedProductIds = new Set();

  if (receiptDoc.daxuatkho) {
    for (const it of items) {
      const pid = String(it.sanphamid || it.san_pham_id || '').trim();
      const productDoc = productDocMap.get(pid);
      if (!productDoc) continue;

      const qty = Number(it.soluong ?? it.so_luong ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      applyDeltaToProductDoc(productDoc, {
        bientheid: it.bientheid || it.bien_the_id || 'main',
        kichco: it.kichco || it.kich_co || ''
      }, -qty);

      await capNhatGiaTheoLoFIFOHienTai({ productDoc, item: it });
      touchedProductIds.add(pid);
    }
  }

  await TonKhoLo.deleteMany({ phieunhap_id: receiptDoc._id });
  await PhieuNhapKho.deleteOne({ _id: receiptDoc._id });

  for (const pid of touchedProductIds) {
    const productDoc = productDocMap.get(String(pid));
    if (!productDoc) continue;
    productDoc.soluongton = tinhTongTon(productDoc);
    productDoc.ngaycapnhat = new Date();
    await productDoc.save();
  }

  return { ok: true, message: 'Đã xóa phiếu nhập thành công' };
}

async function xuatKhoPhieuNhap({ id, adminUser, user }) {
  const receiptDoc = await findReceiptByIdOrCode(id);
  if (!receiptDoc) return { ok: false, message: 'Không tìm thấy phiếu nhập' };

  if (String(receiptDoc.loaiphieu || '') === 'return') {
    return {
      ok: false,
      message: 'Phiếu nhập hoàn trả được tạo tự động, không cần xác nhận nhập kho.',
      receiptId: receiptDoc._id
    };
  }

  if (receiptDoc.daxuatkho) {
    return { ok: true, message: 'Phiếu nhập đã xác nhận nhập kho trước đó', receiptId: receiptDoc._id };
  }

  const items = normalizeItems(receiptDoc.chitiet || receiptDoc.chi_tiet || receiptDoc.items);
  if (!items.length) {
    return { ok: false, message: 'Phiếu nhập không có dòng sản phẩm để xuất kho', receiptId: receiptDoc._id };
  }

  const productIds = Array.from(new Set(items
    .map((it) => String(it.sanphamid || it.san_pham_id || ''))
    .filter((x) => mongoose.Types.ObjectId.isValid(x))));

  const productDocs = await Sanpham.find({ _id: { $in: productIds } });
  const productDocMap = new Map(productDocs.map((p) => [String(p._id), p]));
  const touchedProductIds = new Set();

  await TonKhoLo.deleteMany({ phieunhap_id: receiptDoc._id });
  await taoLoNhapChoPhieu({ receiptDoc, items, productDocMap });

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
  receiptDoc.nguoixuatkho = adminUser?._id || user?._id || null;
  receiptDoc.ngaycapnhat = new Date();
  await receiptDoc.save();

  return {
    ok: true,
    message: 'Đã xác nhận nhập kho: đã cộng tồn và cập nhật giá theo FIFO',
    receiptId: receiptDoc._id
  };
}

module.exports = {
  layDuongDanImports,
  xacDinhLoaiFlashKetQua,
  getDanhSachData,
  getTaoMoiData,
  taoMoiPhieuNhap,
  getChiTietData,
  getChinhSuaData,
  chinhSuaPhieuNhap,
  xoaPhieuNhap,
  xuatKhoPhieuNhap
};
