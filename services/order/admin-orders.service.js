const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const TonKhoLo = require('../../models/inventory_lot_model');
const paginationHelper = require('../../helpers/pagination');
const { thoatBieuThuc } = require('../../helpers/validators');
const { layTrangThaiChoPhep } = require('../../helpers/orderStatus');
const { laLoaiKhongSize, tinhTongTon } = require('../catalog/productStock.service.js');
const {
  danhDauThatBaiTatCaPendingTheoDonHang,
  capNhatGiaoDichThanhToan
} = require('../payment/payment.service.js');
const { taoHoanTienMoMo } = require('../payment/momo.service.js');
const {
  sendOrderConfirmedEmail,
  sendOrderDeliveredEmail
} = require('../communication/orderEmail.service.js');
const { taoPhieuXuatTuDonHang } = require('../inventory/exportReceipt.service.js');
const { dongBoNhapKhoHoanTra } = require('./order-return.service.js');

const TRANG_THAI_CHO_PHEP = layTrangThaiChoPhep().filter((s) => s !== 'all');
const TAP_TRANG_THAI = new Set(TRANG_THAI_CHO_PHEP);

const CHUYEN_TRANG_THAI = {
  choxacnhan: ['daxacnhan', 'dahuy'],
  daxacnhan: ['dangchuanbi', 'dahuy'],
  dangchuanbi: ['danggiao'],
  danggiao: ['dagiao'],
  dagiao: [],
  requested_return: ['approved_return', 'rejected_return'],
  approved_return: ['return_shipping', 'returned', 'returned_full', 'returned_partial'],
  rejected_return: [],
  return_shipping: ['returned', 'returned_full', 'returned_partial'],
  returned: ['refunded'],
  returned_full: ['refunded'],
  returned_partial: ['refunded'],
  refunded: [],
  dahuy: [],
  hoanhang: []
};

const ADMIN_STATUS_LABELS = {
  all: 'Tất cả',
  choxacnhan: 'Chờ xác nhận',
  daxacnhan: 'Đã xác nhận',
  dangchuanbi: 'Đang đóng gói',
  danggiao: 'Đang giao hàng',
  dagiao: 'Hoàn thành',
  requested_return: 'Yêu cầu hoàn hàng',
  approved_return: 'Đã duyệt hoàn hàng',
  rejected_return: 'Từ chối hoàn hàng',
  return_shipping: 'Đang gửi hàng hoàn',
  returned: 'Đã nhận hàng hoàn',
  returned_full: 'Đã trả hàng',
  returned_partial: 'Trả hàng một phần',
  refunded: 'Đã hoàn tiền',
  dahuy: 'Đã hủy',
  hoanhang: 'Hoàn trả'
};

const ADMIN_FLOW = ['choxacnhan', 'daxacnhan', 'dangchuanbi', 'danggiao', 'dagiao'];
const DEFAULT_ORDERS_LIST_URL = '/admin/orders';

function chuanHoaTuKhoa(raw) {
  const k = String(raw || '').trim();
  if (!k) return '';
  return thoatBieuThuc(k.slice(0, 100));
}

function chuanHoaPhuongThuc(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  return v;
}

function phanTichNgay(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function taoChuoiBoLoc({ keyword, status, payment, fromDate, toDate, sort, limit }) {
  let s = '';
  if (keyword) s += `&search=${encodeURIComponent(keyword)}`;
  if (status) s += `&status=${encodeURIComponent(status)}`;
  if (payment) s += `&paymentMethod=${encodeURIComponent(payment)}`;
  if (fromDate) s += `&fromDate=${encodeURIComponent(fromDate)}`;
  if (toDate) s += `&toDate=${encodeURIComponent(toDate)}`;
  if (sort) s += `&sort=${encodeURIComponent(sort)}`;
  if (limit) s += `&limit=${encodeURIComponent(limit)}`;
  return s;
}

function sortMap(sortKey) {
  switch (sortKey) {
    case 'oldest':
      return { ngaytao: 1, createdAt: 1, _id: 1 };
    case 'total-asc':
      return { tongtien: 1, tamtinh: 1 };
    case 'total-desc':
      return { tongtien: -1, tamtinh: -1 };
    case 'newest':
    default:
      return { ngaytao: -1, createdAt: -1, _id: -1 };
  }
}

function layDuongDanDanhSachHopLe(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';

  let path = '';
  try {
    const parsed = new URL(input, 'http://localhost');
    path = `${parsed.pathname || ''}${parsed.search || ''}`;
  } catch {
    return '';
  }

  if (!path.startsWith('/admin/orders')) return '';
  if (/^\/admin\/orders\/[^/?#]+/.test(path)) return '';
  return path;
}

function layDuongDanDanhSachMacDinh() {
  return DEFAULT_ORDERS_LIST_URL;
}

function layDuongDanQuayLaiDanhSach({ fromBody, fromQuery } = {}) {
  return layDuongDanDanhSachHopLe(fromBody)
    || layDuongDanDanhSachHopLe(fromQuery)
    || layDuongDanDanhSachMacDinh();
}

function taoDuongDanChiTietDon({ id, returnTo } = {}) {
  const safeId = encodeURIComponent(String(id || '').trim());
  const safeReturnTo = layDuongDanDanhSachHopLe(returnTo) || layDuongDanDanhSachMacDinh();
  return `/admin/orders/${safeId}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

function taoTenFileXuatDonHang(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `don-hang-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;
}

function xacDinhLoaiFlashKetQua(result, options = {}) {
  const { warningCodes = [], warningWhenPartial = false } = options || {};
  if (!result || !result.ok) {
    if (result && result.code && warningCodes.includes(result.code)) return 'warning';
    return 'error';
  }
  if (warningWhenPartial && result.isPartial) return 'warning';
  return 'success';
}

function buildBadgeClass(status) {
  switch (status) {
    case 'choxacnhan':
      return 'bg-warning text-dark';
    case 'daxacnhan':
      return 'bg-primary';
    case 'dangchuanbi':
      return 'bg-info text-dark';
    case 'danggiao':
      return 'bg-warning';
    case 'dagiao':
      return 'bg-success';
    case 'requested_return':
      return 'bg-warning text-dark';
    case 'approved_return':
      return 'bg-info text-dark';
    case 'rejected_return':
      return 'bg-danger';
    case 'return_shipping':
      return 'bg-primary';
    case 'returned':
      return 'bg-secondary';
    case 'returned_full':
      return 'bg-success';
    case 'returned_partial':
      return 'bg-warning text-dark';
    case 'refunded':
      return 'bg-dark';
    case 'dahuy':
      return 'bg-danger';
    case 'hoanhang':
      return 'bg-secondary';
    default:
      return 'bg-secondary';
  }
}

function layNhanTrangThai(status) {
  return ADMIN_STATUS_LABELS[status] || status || '—';
}

function taoBoLocTuQuery(query = {}) {
  const keyword = chuanHoaTuKhoa(query.search);
  const statusRaw = String(query.status || 'all').trim();
  const status = (statusRaw && TAP_TRANG_THAI.has(statusRaw)) ? statusRaw : 'all';
  const paymentMethod = chuanHoaPhuongThuc(query.paymentMethod);
  const fromDate = phanTichNgay(query.fromDate);
  const toDate = phanTichNgay(query.toDate);
  const sort = String(query.sort || 'newest');

  const limitRaw = parseInt(query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(10, limitRaw)) : 10;

  const boloc = { daxoa: { $ne: true } };

  if (status !== 'all') boloc.trangthai = status;
  if (paymentMethod) boloc.phuongthucthanhtoan = paymentMethod;

  if (keyword) {
    boloc.$or = [
      { madonhang: { $regex: keyword, $options: 'i' } },
      { tennguoinhan: { $regex: keyword, $options: 'i' } },
      { sodienthoai: { $regex: keyword, $options: 'i' } },
      { email: { $regex: keyword, $options: 'i' } }
    ];
  }

  if (fromDate || toDate) {
    const range = {};
    if (fromDate) {
      fromDate.setHours(0, 0, 0, 0);
      range.$gte = fromDate;
    }
    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
      range.$lte = toDate;
    }
    boloc.ngaytao = range;
  }

  return {
    boloc,
    keyword,
    status,
    paymentMethod,
    fromDate: query.fromDate || '',
    toDate: query.toDate || '',
    sort,
    limit
  };
}

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

function buildExportLineKey({ sanphamid, bientheid, kichco }) {
  const productId = String(sanphamid || '').trim();
  const variantId = bientheid ? String(bientheid).trim() : 'main';
  const sizeKey = String(kichco || '').trim();
  return `${productId}|${variantId}|${sizeKey}`;
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0));
}

function tinhTySuatLoiNhuan({ doanhThu, loiNhuan }) {
  const dt = toNumber(doanhThu, 0);
  const ln = toNumber(loiNhuan, 0);
  if (dt <= 0) return 0;
  return Number(((ln / dt) * 100).toFixed(2));
}

async function congTonChoChiTietDon(orderitemdoc) {
  const productid = orderitemdoc.sanpham_id;
  const variantid = orderitemdoc.bienthe_id;
  const size = orderitemdoc.kichco;
  const qty = Math.max(1, parseInt(orderitemdoc.soluong, 10) || 1);

  const product = await Sanpham.findById(productid);
  if (!product) throw new Error('Sản phẩm không tồn tại');

  const basetotal = (typeof product.soluongton === 'number') ? product.soluongton : tinhTongTon(product);
  const hassize = !laLoaiKhongSize(product.loaisanpham);

  if (!variantid) {
    if (hassize) {
      product.sizes = product.sizes || [];
      let row = (product.sizes || []).find(s => s.size === size);
      if (!row) {
        product.sizes.push({ size, soluong: qty });
      } else {
        row.soluong = Number(row.soluong || 0) + qty;
      }
    } else {
      product.soluong_chinh = Number(product.soluong_chinh || 0) + qty;
    }

    product.soluongton = basetotal + qty;
    await product.save();
    return;
  }

  const v = (product.bienthe || []).id(variantid);
  if (!v) throw new Error('Biến thể không tồn tại');

  if (hassize) {
    v.sizes = v.sizes || [];
    let row = (v.sizes || []).find(s => s.size === size);
    if (!row) {
      v.sizes.push({ size, soluong: qty });
    } else {
      row.soluong = Number(row.soluong || 0) + qty;
    }
  } else {
    v.soluong = Number(v.soluong || 0) + qty;
  }

  product.soluongton = basetotal + qty;
  await product.save();
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

async function getDanhSachData(query = {}) {
  const { boloc, keyword, status, paymentMethod, fromDate, toDate, sort, limit } = taoBoLocTuQuery(query);

  const tongdon = await Donhang.countDocuments(boloc);
  let phantrang = { currentPage: 1, limit };
  phantrang = paginationHelper(phantrang, query, tongdon);

  const danhsach = await Donhang.find(boloc)
    .sort(sortMap(sort))
    .skip(phantrang.skip)
    .limit(phantrang.limit)
    .lean();

  const danhsachXuLy = (danhsach || []).map((o) => {
    const allowedNext = (CHUYEN_TRANG_THAI[o.trangthai] || []).filter((s) => s !== 'dahuy');
    return {
      ...o,
      allowedNext,
      label: layNhanTrangThai(o.trangthai)
    };
  });

  const filterString = taoChuoiBoLoc({
    keyword: keyword || '',
    status: status !== 'all' ? status : '',
    payment: paymentMethod || '',
    fromDate: query.fromDate || '',
    toDate: query.toDate || '',
    sort: sort || 'newest',
    limit
  });
  const currentListUrl = `/admin/orders?page=${phantrang.currentPage}${filterString || ''}`;
  const exportQuery = filterString ? `?${filterString.replace(/^&/, '')}` : '';

  return {
    titlePage: 'Quản lý đơn hàng',
    orders: danhsachXuLy,
    filters: {
      search: keyword || '',
      status,
      paymentMethod,
      fromDate,
      toDate,
      sort,
      limit
    },
    pagination: phantrang,
    statusLabels: ADMIN_STATUS_LABELS,
    statusOptions: TRANG_THAI_CHO_PHEP,
    badgeClass: buildBadgeClass,
    filterString,
    currentListUrl,
    exportQuery
  };
}

function getDanhSachFallbackData() {
  return {
    titlePage: 'Quản lý đơn hàng',
    orders: [],
    filters: { search: '', status: 'all', paymentMethod: '', fromDate: '', toDate: '', sort: 'newest', limit: 10 },
    pagination: { currentPage: 1, limit: 10, skip: 0, totalPages: 0, totalProducts: 0 },
    statusLabels: ADMIN_STATUS_LABELS,
    statusOptions: TRANG_THAI_CHO_PHEP,
    badgeClass: buildBadgeClass,
    filterString: '',
    currentListUrl: '/admin/orders',
    exportQuery: ''
  };
}

async function getChiTietData(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, code: 'INVALID_ID', message: 'ID không hợp lệ' };
  }

  const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } }).lean();
  if (!order) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy đơn hàng' };
  }

  const hasReturnImport = Boolean(await PhieuNhapKho.exists({
    donhang_id: order._id,
    loaiphieu: 'return'
  }));

  const itemsRaw = await Chitietdonhang.find({ donhang_id: order._id }).lean();
  const items = (itemsRaw || []).map((it) => {
    const goc = Number(it?.giagoc || 0);
    const giam = Number(it?.giaban || it?.giagoc || 0);
    const heSoGiam = goc > 0 ? (giam / goc) : 1;
    const heSoApDung = Number.isFinite(heSoGiam) && heSoGiam > 0 ? heSoGiam : 1;

    const fifoRows = Array.isArray(it?.fifoAllocations)
      ? it.fifoAllocations
        .map((a) => {
          const soLuong = Math.max(0, Number(a?.soLuong || 0));
          const giaGocLo = Math.max(0, Number(a?.giaBanDeXuat || 0));
          if (soLuong <= 0 || giaGocLo <= 0) return null;

          const giaBanLo = Math.max(0, Math.round(giaGocLo * heSoApDung));
          const thanhTienLo = Math.max(0, Math.round(giaBanLo * soLuong));
          return {
            soLuong,
            giagoc: giaGocLo,
            giaban: giaBanLo,
            thanhtien: thanhTienLo
          };
        })
        .filter(Boolean)
      : [];

    const tongSoLuong = fifoRows.length
      ? fifoRows.reduce((sum, row) => sum + Number(row.soLuong || 0), 0)
      : Math.max(0, Number(it?.soluong || 0));
    const tongThanhTien = fifoRows.length
      ? fifoRows.reduce((sum, row) => sum + Number(row.thanhtien || 0), 0)
      : Math.max(0, Number(it?.thanhtien || ((it?.giaban || it?.giagoc || 0) * (it?.soluong || 1)) || 0));

    return {
      ...it,
      fifoRows,
      tongSoLuong,
      tongThanhTien
    };
  });

  const allowedNext = (CHUYEN_TRANG_THAI[order.trangthai] || []).filter((s) => s !== 'dahuy');

  return {
    ok: true,
    data: {
      titlePage: `Chi tiết ${order.madonhang || 'đơn hàng'}`,
      order,
      items,
      hasReturnImport,
      statusLabels: ADMIN_STATUS_LABELS,
      flow: ADMIN_FLOW,
      allowedNext,
      badgeClass: buildBadgeClass
    }
  };
}

async function buildExportWorkbook(query = {}) {
  const { boloc } = taoBoLocTuQuery(query);
  const rows = await Donhang.find(boloc).sort({ ngaytao: -1 }).lean();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMDT_ThoiTrang';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('DonHang');
  worksheet.columns = [
    { header: 'Mã đơn', key: 'madon', width: 16 },
    { header: 'Khách hàng', key: 'khachhang', width: 24 },
    { header: 'SĐT', key: 'sdt', width: 16 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Thanh toán', key: 'thanhtoan', width: 14 },
    { header: 'Trạng thái', key: 'trangthai', width: 18 },
    { header: 'Tổng tiền', key: 'tongtien', width: 14 },
    { header: 'Ngày tạo', key: 'ngaytao', width: 22 }
  ];

  for (const o of (rows || [])) {
    worksheet.addRow({
      madon: String(o.madonhang || ''),
      khachhang: String(o.tennguoinhan || ''),
      sdt: String(o.sodienthoai || ''),
      email: String(o.email || ''),
      thanhtoan: String((o.phuongthucthanhtoan || '').toUpperCase()),
      trangthai: String(layNhanTrangThai(o.trangthai)),
      tongtien: Number(o.tongtien || o.tamtinh || 0),
      ngaytao: o.ngaytao ? new Date(o.ngaytao) : null
    });
  }

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.getColumn('sdt').numFmt = '@';
  worksheet.getColumn('madon').numFmt = '@';
  worksheet.getColumn('tongtien').numFmt = '#,##0';
  worksheet.getColumn('ngaytao').numFmt = 'dd/mm/yyyy hh:mm:ss';

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });

  worksheet.columns.forEach((column) => {
    let maxLength = String(column.header || '').length;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value;
      let cellText = '';
      if (value instanceof Date) {
        cellText = value.toISOString();
      } else if (value && typeof value === 'object' && value.richText) {
        cellText = value.richText.map((part) => part.text || '').join('');
      } else {
        cellText = value !== null && value !== undefined ? String(value) : '';
      }
      if (cellText.length > maxLength) maxLength = cellText.length;
    });
    column.width = Math.min(Math.max(maxLength + 2, 12), 50);
  });

  return workbook;
}

async function getTongQuanDonMoiData() {
  const filter = { daxoa: { $ne: true }, trangthai: 'choxacnhan' };
  const [count, latest] = await Promise.all([
    Donhang.countDocuments(filter),
    Donhang.findOne(filter)
      .sort({ ngaytao: -1 })
      .select('_id madonhang tennguoinhan ngaytao')
      .lean()
  ]);

  return {
    success: true,
    count: Number(count || 0),
    latestOrder: latest
      ? {
        id: String(latest._id),
        madonhang: latest.madonhang || '',
        tennguoinhan: latest.tennguoinhan || '',
        ngaytao: latest.ngaytao || null
      }
      : null
  };
}

async function capNhatTrangThaiDon({ id, nextStatus, actor }) {
  const orderId = String(id || '');
  const status = String(nextStatus || '').trim();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, code: 'INVALID_ID', message: 'ID không hợp lệ' };
  }

  if (!TAP_TRANG_THAI.has(status) || status === 'dahuy') {
    return { ok: false, code: 'INVALID_STATUS', message: 'Trạng thái không hợp lệ' };
  }

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order) {
    return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy đơn hàng' };
  }

  const allowedNext = CHUYEN_TRANG_THAI[order.trangthai] || [];
  if (!allowedNext.includes(status)) {
    return { ok: false, code: 'INVALID_FLOW', message: 'Không thể chuyển trạng thái theo luồng hiện tại' };
  }

  const updateResult = await Donhang.updateOne(
    { _id: orderId, trangthai: order.trangthai, daxoa: { $ne: true } },
    {
      $set: {
        trangthai: status,
        ngaycapnhat: new Date(),
        ...(status === 'dagiao' ? { ngaygiaohang: new Date() } : {})
      }
    }
  );

  if (!updateResult || Number(updateResult.modifiedCount || 0) === 0) {
    return {
      ok: false,
      code: 'CONFLICT',
      message: 'Không thể cập nhật trạng thái (dữ liệu có thể đã thay đổi)'
    };
  }

  try {
    if (status === 'daxacnhan') {
      await taoPhieuXuatTuDonHang({
        orderId,
        adminUser: actor,
        note: 'Tự động tạo khi đơn hàng được xác nhận',
        skipInventoryAdjustments: true
      });
      const mailResult = await sendOrderConfirmedEmail({ orderId });
      if (!mailResult.sent && mailResult.reason === 'already-sent') {
        console.log('ORDER_CONFIRM_EMAIL_SKIPPED_ALREADY_SENT', { orderId });
      }
    }

    if (status === 'dagiao') {
      const mailResult = await sendOrderDeliveredEmail({ orderId });
      if (!mailResult.sent && mailResult.reason === 'already-sent') {
        console.log('ORDER_DELIVERED_EMAIL_SKIPPED_ALREADY_SENT', { orderId });
      }
    }
  } catch (mailError) {
    if (status === 'daxacnhan') {
      await Donhang.updateOne(
        { _id: orderId, trangthai: status, daxoa: { $ne: true } },
        { $set: { trangthai: order.trangthai, ngaycapnhat: new Date() } }
      ).catch(() => {});
      return {
        ok: false,
        code: 'SIDE_EFFECT_ERROR',
        message: 'Không thể cập nhật trạng thái do lỗi tạo phiếu xuất hoặc gửi email.'
      };
    }

    return {
      ok: false,
      code: 'MAIL_ERROR',
      message: 'Đã cập nhật trạng thái nhưng gửi email thất bại. Vui lòng kiểm tra SMTP/log.'
    };
  }

  return { ok: true, message: 'Cập nhật trạng thái thành công' };
}

async function duyetHoanHang({ id, note }) {
  const orderId = String(id || '');
  const adminNote = String(note || '').trim();

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };
  if (String(order.trangthai) !== 'requested_return') {
    return { ok: false, message: 'Đơn không ở trạng thái chờ duyệt hoàn hàng' };
  }

  order.trangthai = 'approved_return';
  order.ngaycapnhat = new Date();
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    reviewedAt: new Date(),
    approvedAt: new Date(),
    adminNote: adminNote || (order.yeucauhoanhang && order.yeucauhoanhang.adminNote) || ''
  };
  await order.save();

  return { ok: true, message: 'Đã duyệt yêu cầu hoàn hàng.' };
}

async function tuChoiHoanHang({ id, note }) {
  const orderId = String(id || '');
  const adminNote = String(note || '').trim();

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };
  if (String(order.trangthai) !== 'requested_return') {
    return { ok: false, message: 'Đơn không ở trạng thái chờ duyệt hoàn hàng' };
  }

  order.trangthai = 'rejected_return';
  order.ngaycapnhat = new Date();
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    reviewedAt: new Date(),
    rejectedAt: new Date(),
    adminNote: adminNote || 'Yêu cầu hoàn hàng chưa đủ điều kiện'
  };
  await order.save();

  return { ok: true, message: 'Đã từ chối yêu cầu hoàn hàng.' };
}

async function xacNhanDaNhanHangHoan({ id, payload = {}, actor = null }) {
  return dongBoNhapKhoHoanTra({
    id,
    payload,
    actor
  });
}

async function hoanTienDon(id) {
  const orderId = String(id || '');
  let order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
  if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng' };
  if (!['returned', 'returned_full', 'returned_partial'].includes(String(order.trangthai))) {
    return { ok: false, message: 'Đơn hàng chưa ở trạng thái đã nhận hàng hoàn.' };
  }

  // Guard rail: if legacy flow moved order to returned but stock was not re-imported,
  // automatically create the return import receipt before issuing refund.
  const existedReturnImport = await PhieuNhapKho.findOne({
    donhang_id: order._id,
    loaiphieu: 'return'
  })
    .select('_id maphieu')
    .lean();

  if (!existedReturnImport) {
    const receiveResult = await xacNhanDaNhanHangHoan({
      id: String(order._id),
      payload: {},
      actor: null
    });
    if (!receiveResult || !receiveResult.ok) {
      return {
        ok: false,
        message: `Không thể hoàn tiền vì chưa nhập kho hoàn trả: ${receiveResult && receiveResult.message ? receiveResult.message : 'UNKNOWN'}`
      };
    }

    order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } });
    if (!order) return { ok: false, message: 'Không tìm thấy đơn hàng sau khi xử lý nhập hoàn trả' };
  }

  const refundMethod = String((order.yeucauhoanhang && order.yeucauhoanhang.refundMethod) || order.phuongthucthanhtoan || 'bank');
  const soTienHoan = Number(order.tongtien || order.tamtinh || 0);

  if (refundMethod === 'momo' || String(order.phuongthucthanhtoan || '') === 'momo') {
    if (!order.momoTransId) {
      return { ok: false, message: 'Không tìm thấy mã giao dịch MoMo để hoàn tiền.' };
    }

    if (!order.momoRefunded) {
      const ketqua = await taoHoanTienMoMo({
        orderId: String(order._id),
        requestId: `${String(order._id)}-refund-admin-${Date.now()}`,
        amount: String(Math.max(0, Math.round(soTienHoan))),
        transId: String(order.momoTransId),
        description: `Hoàn tiền đơn hàng ${order.madonhang || String(order._id)}`
      });

      if (!(ketqua && (ketqua.resultCode === 0 || ketqua.message === 'Success'))) {
        return { ok: false, message: ketqua?.message || 'Yêu cầu hoàn tiền MoMo thất bại.' };
      }

      order.momoRefunded = true;
      order.momoRefundAt = new Date();
    }
  }

  await capNhatGiaoDichThanhToan({
    donhangId: order._id,
    nguoidungId: order.nguoidung_id,
    phuongthuc: refundMethod === 'wallet' ? 'banking' : refundMethod,
    sotien: soTienHoan,
    trangthai: 'refunded',
    ghichu: 'Hoàn tiền đơn hàng sau khi nhận hàng hoàn',
    response: { manualRefundByAdmin: true, refundedAt: new Date().toISOString() }
  });

  order.trangthai = 'refunded';
  order.ngaycapnhat = new Date();
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    refundedAt: new Date()
  };
  await order.save();

  return { ok: true, message: 'Đã hoàn tiền thành công.' };
}

async function capNhatTrangThaiHangLoat({ orderIds, nextStatus, actor }) {
  const status = String(nextStatus || '').trim();

  const ids = Array.from(new Set(
    (Array.isArray(orderIds) ? orderIds : [])
      .map((id) => String(id || '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  ));

  if (!ids.length) {
    return { ok: false, message: 'Vui lòng chọn ít nhất một đơn hàng' };
  }

  if (!TAP_TRANG_THAI.has(status) || status === 'dahuy') {
    return { ok: false, message: 'Trạng thái cập nhật không hợp lệ' };
  }

  const orders = await Donhang.find({ _id: { $in: ids }, daxoa: { $ne: true } }).lean();

  let updatedCount = 0;
  let skippedCount = 0;
  let mailErrorCount = 0;

  for (const order of (orders || [])) {
    const allowedNext = CHUYEN_TRANG_THAI[order.trangthai] || [];
    if (!allowedNext.includes(status)) {
      skippedCount += 1;
      continue;
    }

    const updateResult = await Donhang.updateOne(
      { _id: order._id, trangthai: order.trangthai, daxoa: { $ne: true } },
      { $set: { trangthai: status, ngaycapnhat: new Date() } }
    );

    if (!updateResult || Number(updateResult.modifiedCount || 0) === 0) {
      skippedCount += 1;
      continue;
    }

    updatedCount += 1;

    try {
      if (status === 'daxacnhan') {
        await taoPhieuXuatTuDonHang({
          orderId: order._id,
          adminUser: actor,
          note: 'Tự động tạo khi đơn hàng được xác nhận (bulk)',
          skipInventoryAdjustments: true
        });
        await sendOrderConfirmedEmail({ orderId: order._id });
      }
      if (status === 'dagiao') {
        await sendOrderDeliveredEmail({ orderId: order._id });
      }
    } catch (mailError) {
      if (status === 'daxacnhan') {
        await Donhang.updateOne(
          { _id: order._id, trangthai: status, daxoa: { $ne: true } },
          { $set: { trangthai: order.trangthai, ngaycapnhat: new Date() } }
        ).catch(() => {});
        updatedCount = Math.max(0, updatedCount - 1);
        skippedCount += 1;
      }
      mailErrorCount += 1;
      console.error('bulk order status side effect error:', { orderId: String(order._id), error: mailError });
    }
  }

  if (updatedCount === 0) {
    return { ok: false, message: 'Không có đơn nào được cập nhật trạng thái' };
  }

  let message = `Đã cập nhật ${updatedCount} đơn hàng`;
  if (skippedCount > 0) message += `, bỏ qua ${skippedCount} đơn không đúng luồng`;
  if (mailErrorCount > 0) message += `, ${mailErrorCount} đơn gửi email thất bại`;

  return { ok: true, message };
}

async function huyDon({ id, reason }) {
  const orderId = String(id || '');
  const lydo = String(reason || '').trim() || 'Admin hủy đơn';

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, code: 'INVALID_ID', message: 'ID không hợp lệ' };
  }

  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy đơn hàng' };

  if (!['choxacnhan', 'daxacnhan'].includes(order.trangthai)) {
    return { ok: false, code: 'INVALID_STATE', message: 'Đơn hàng không thể hủy ở trạng thái hiện tại' };
  }

  if (order.dathanhtoan) {
    return { ok: false, code: 'PAID_ORDER', message: 'Không thể hủy đơn đã thanh toán' };
  }

  const updated = await Donhang.findOneAndUpdate(
    { _id: orderId, daxoa: { $ne: true }, trangthai: order.trangthai },
    { $set: { trangthai: 'dahuy', lydohuy: lydo, ngaycapnhat: new Date() } },
    { new: true }
  );

  if (!updated) {
    return { ok: false, code: 'CONFLICT', message: 'Không thể hủy đơn hàng' };
  }

  const danhsachitem = await Chitietdonhang.find({ donhang_id: updated._id });
  const danhsachloi = [];

  for (const it of (danhsachitem || [])) {
    try {
      await congTonChoChiTietDon(it);
    } catch (e) {
      danhsachloi.push(e?.message || 'Có lỗi khi hoàn tồn kho');
    }
  }

  try {
    await Chitietdonhang.updateMany(
      { donhang_id: updated._id },
      { $set: { trangthai: 'dahuy' } }
    );
  } catch {
    // best-effort
  }

  try {
    await danhDauThatBaiTatCaPendingTheoDonHang({
      donhangId: updated._id,
      response: { cancel: true, reason: lydo },
      ghichu: 'Hủy đơn từ admin (chưa thanh toán)'
    });
  } catch {
    // best-effort
  }

  if (danhsachloi.length) {
    return {
      ok: true,
      message: 'Đã hủy đơn nhưng có lỗi khi hoàn tồn kho cho một số sản phẩm.',
      isPartial: true,
      orderId: updated._id
    };
  }

  return { ok: true, message: 'Đã hủy đơn hàng', orderId: updated._id };
}

module.exports = {
  ADMIN_STATUS_LABELS,
  TRANG_THAI_CHO_PHEP,
  ADMIN_FLOW,
  buildBadgeClass,
  layDuongDanDanhSachMacDinh,
  layDuongDanQuayLaiDanhSach,
  taoDuongDanChiTietDon,
  taoTenFileXuatDonHang,
  xacDinhLoaiFlashKetQua,
  layDuongDanDanhSachHopLe,
  getDanhSachData,
  getDanhSachFallbackData,
  getChiTietData,
  buildExportWorkbook,
  getTongQuanDonMoiData,
  capNhatTrangThaiDon,
  duyetHoanHang,
  tuChoiHoanHang,
  xacNhanDaNhanHangHoan,
  hoanTienDon,
  capNhatTrangThaiHangLoat,
  huyDon
};
