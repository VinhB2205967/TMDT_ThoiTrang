const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const paginationHelper = require('../../helpers/pagination');
const { thoatBieuThuc } = require('../../helpers/validators');
const { layTrangThaiChoPhep } = require('../../helpers/orderStatus');
const { laLoaiKhongSize, tinhTongTon } = require('../../services/productStock.service');
const { danhDauThatBaiTatCaPendingTheoDonHang } = require('../../services/payment.service');
const { capNhatGiaoDichThanhToan } = require('../../services/payment.service');
const { taoHoanTienMoMo } = require('../../services/momo.service');
const { sendOrderConfirmedEmail, sendOrderDeliveredEmail } = require('../../services/orderEmail.service');
const { createExportReceiptFromOrder } = require('../../services/exportReceipt.service');

const TRANG_THAI_CHO_PHEP = layTrangThaiChoPhep().filter((s) => s !== 'all');
const TAP_TRANG_THAI = new Set(TRANG_THAI_CHO_PHEP);

const CHUYEN_TRANG_THAI = {
  choxacnhan: ['daxacnhan', 'dahuy'],
  daxacnhan: ['dangchuanbi', 'dahuy'],
  dangchuanbi: ['danggiao'],
  danggiao: ['dagiao'],
  dagiao: ['requested_return'],
  requested_return: ['approved_return', 'rejected_return'],
  approved_return: ['return_shipping', 'returned'],
  rejected_return: [],
  return_shipping: ['returned'],
  returned: ['refunded'],
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
  refunded: 'Đã hoàn tiền',
  dahuy: 'Đã hủy',
  hoanhang: 'Hoàn trả'
};

const ADMIN_FLOW = ['choxacnhan', 'daxacnhan', 'dangchuanbi', 'danggiao', 'dagiao'];

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

function taoBoLocTuQuery(query) {
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

module.exports.danhSach = async (req, res) => {
  try {
    const { boloc, keyword, status, paymentMethod, fromDate, toDate, sort, limit } = taoBoLocTuQuery(req.query);

    const tongdon = await Donhang.countDocuments(boloc);
    let phantrang = { currentPage: 1, limit };
    phantrang = paginationHelper(phantrang, req.query, tongdon);

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
      fromDate: req.query.fromDate || '',
      toDate: req.query.toDate || '',
      sort: sort || 'newest',
      limit
    });
    const currentListUrl = `/admin/orders?page=${phantrang.currentPage}${filterString || ''}`;
    const exportQuery = filterString ? `?${filterString.replace(/^&/, '')}` : '';

    return res.render('admin/pages/orders/index.pug', {
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
    });
  } catch (err) {
    console.error('admin orders index error:', err);
    req.flash('error', 'Không thể tải danh sách đơn hàng');
    return res.render('admin/pages/orders/index.pug', {
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
    });
  }
};

module.exports.chiTiet = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/orders');
    }

    const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } }).lean();
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect('/admin/orders');
    }

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

    return res.render('admin/pages/orders/detail.pug', {
      titlePage: `Chi tiết ${order.madonhang || 'đơn hàng'}`,
      order,
      items,
      statusLabels: ADMIN_STATUS_LABELS,
      flow: ADMIN_FLOW,
      allowedNext,
      badgeClass: buildBadgeClass
    });
  } catch (err) {
    console.error('admin orders detail error:', err);
    req.flash('error', 'Không thể tải chi tiết đơn hàng');
    return res.redirect('/admin/orders');
  }
};

module.exports.exportExcel = async (req, res) => {
  try {
    const { boloc } = taoBoLocTuQuery(req.query);
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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="orders_export.xlsx"');
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error('admin orders export error:', err);
    req.flash('error', 'Không thể xuất danh sách đơn hàng');
    return res.redirect('/admin/orders');
  }
};

module.exports.tongQuanDonMoi = async (req, res) => {
  try {
    const filter = { daxoa: { $ne: true }, trangthai: 'choxacnhan' };
    const [count, latest] = await Promise.all([
      Donhang.countDocuments(filter),
      Donhang.findOne(filter)
        .sort({ ngaytao: -1 })
        .select('_id madonhang tennguoinhan ngaytao')
        .lean()
    ]);

    return res.json({
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
    });
  } catch (err) {
    console.error('orders new summary error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy thông báo đơn mới' });
  }
};

module.exports.capNhatTrangThai = async (req, res) => {
  try {
    const id = req.params.id;
    const nextStatus = String(req.body.status || '').trim();
    const returnToListPath =
      layDuongDanDanhSachHopLe(req.body.returnTo) ||
      layDuongDanDanhSachHopLe(req.get('referer'));
    const redirectPath = returnToListPath || `/admin/orders/${id}`;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect(returnToListPath || '/admin/orders');
    }

    if (!TAP_TRANG_THAI.has(nextStatus) || nextStatus === 'dahuy') {
      req.flash('error', 'Trạng thái không hợp lệ');
      return res.redirect(redirectPath);
    }

    const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } }).lean();
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect(returnToListPath || '/admin/orders');
    }

    const allowedNext = CHUYEN_TRANG_THAI[order.trangthai] || [];
    if (!allowedNext.includes(nextStatus)) {
      req.flash('error', 'Không thể chuyển trạng thái theo luồng hiện tại');
      return res.redirect(redirectPath);
    }

    const updateResult = await Donhang.updateOne(
      { _id: id, trangthai: order.trangthai, daxoa: { $ne: true } },
      {
        $set: {
          trangthai: nextStatus,
          ngaycapnhat: new Date(),
          ...(nextStatus === 'dagiao' ? { ngaygiaohang: new Date() } : {})
        }
      }
    );

    if (!updateResult || Number(updateResult.modifiedCount || 0) === 0) {
      req.flash('error', 'Không thể cập nhật trạng thái (dữ liệu có thể đã thay đổi)');
      return res.redirect(redirectPath);
    }

    try {
      if (nextStatus === 'daxacnhan') {
        await createExportReceiptFromOrder({
          orderId: id,
          adminUser: req.adminUser || req.user,
          note: 'Tự động tạo khi đơn hàng được xác nhận',
          skipInventoryAdjustments: true
        });
        const mailResult = await sendOrderConfirmedEmail({ orderId: id });
        if (!mailResult.sent && mailResult.reason === 'already-sent') {
          console.log('ORDER_CONFIRM_EMAIL_SKIPPED_ALREADY_SENT', { orderId: id });
        }
      }

      if (nextStatus === 'dagiao') {
        const mailResult = await sendOrderDeliveredEmail({ orderId: id });
        if (!mailResult.sent && mailResult.reason === 'already-sent') {
          console.log('ORDER_DELIVERED_EMAIL_SKIPPED_ALREADY_SENT', { orderId: id });
        }
      }
    } catch (mailError) {
      console.error('order status side effect error:', mailError);
      if (nextStatus === 'daxacnhan') {
        await Donhang.updateOne(
          { _id: id, trangthai: nextStatus, daxoa: { $ne: true } },
          { $set: { trangthai: order.trangthai, ngaycapnhat: new Date() } }
        ).catch(() => {});
        req.flash('error', 'Không thể cập nhật trạng thái do lỗi tạo phiếu xuất hoặc gửi email.');
      } else {
        req.flash('error', 'Đã cập nhật trạng thái nhưng gửi email thất bại. Vui lòng kiểm tra SMTP/log.');
      }
      return res.redirect(redirectPath);
    }

    req.flash('success', 'Cập nhật trạng thái thành công');
    return res.redirect(redirectPath);
  } catch (err) {
    console.error('admin update order status error:', err);
    req.flash('error', 'Không thể cập nhật trạng thái đơn hàng');
    const returnToListPath =
      layDuongDanDanhSachHopLe(req.body.returnTo) ||
      layDuongDanDanhSachHopLe(req.get('referer'));
    if (returnToListPath) return res.redirect(returnToListPath);
    return res.redirect(`/admin/orders/${req.params.id}`);
  }
};

module.exports.duyetHoanHang = async (req, res) => {
  try {
    const id = req.params.id;
    const note = String(req.body.note || '').trim();
    const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } });
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect('/admin/orders');
    }
    if (String(order.trangthai) !== 'requested_return') {
      req.flash('error', 'Đơn không ở trạng thái chờ duyệt hoàn hàng');
      return res.redirect(`/admin/orders/${id}`);
    }

    order.trangthai = 'approved_return';
    order.ngaycapnhat = new Date();
    order.yeucauhoanhang = {
      ...(order.yeucauhoanhang || {}),
      reviewedAt: new Date(),
      approvedAt: new Date(),
      adminNote: note || (order.yeucauhoanhang && order.yeucauhoanhang.adminNote) || ''
    };
    await order.save();

    req.flash('success', 'Đã duyệt yêu cầu hoàn hàng.');
    return res.redirect(`/admin/orders/${id}`);
  } catch (err) {
    console.error('approve return error:', err);
    req.flash('error', 'Không thể duyệt yêu cầu hoàn hàng.');
    return res.redirect(`/admin/orders/${req.params.id}`);
  }
};

module.exports.tuChoiHoanHang = async (req, res) => {
  try {
    const id = req.params.id;
    const note = String(req.body.note || '').trim();
    const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } });
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect('/admin/orders');
    }
    if (String(order.trangthai) !== 'requested_return') {
      req.flash('error', 'Đơn không ở trạng thái chờ duyệt hoàn hàng');
      return res.redirect(`/admin/orders/${id}`);
    }

    order.trangthai = 'rejected_return';
    order.ngaycapnhat = new Date();
    order.yeucauhoanhang = {
      ...(order.yeucauhoanhang || {}),
      reviewedAt: new Date(),
      rejectedAt: new Date(),
      adminNote: note || 'Yêu cầu hoàn hàng chưa đủ điều kiện'
    };
    await order.save();

    req.flash('success', 'Đã từ chối yêu cầu hoàn hàng.');
    return res.redirect(`/admin/orders/${id}`);
  } catch (err) {
    console.error('reject return error:', err);
    req.flash('error', 'Không thể từ chối yêu cầu hoàn hàng.');
    return res.redirect(`/admin/orders/${req.params.id}`);
  }
};

module.exports.xacNhanDaNhanHangHoan = async (req, res) => {
  try {
    const id = req.params.id;
    const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } });
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect('/admin/orders');
    }

    if (!['approved_return', 'return_shipping'].includes(String(order.trangthai))) {
      req.flash('error', 'Đơn chưa ở trạng thái nhận hàng hoàn.');
      return res.redirect(`/admin/orders/${id}`);
    }

    order.trangthai = 'returned';
    order.ngaycapnhat = new Date();
    order.yeucauhoanhang = {
      ...(order.yeucauhoanhang || {}),
      returnedAt: new Date()
    };
    await order.save();

    req.flash('success', 'Đã xác nhận nhận hàng hoàn.');
    return res.redirect(`/admin/orders/${id}`);
  } catch (err) {
    console.error('confirm returned error:', err);
    req.flash('error', 'Không thể xác nhận nhận hàng hoàn.');
    return res.redirect(`/admin/orders/${req.params.id}`);
  }
};

module.exports.hoanTienDon = async (req, res) => {
  try {
    const id = req.params.id;
    const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } });
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect('/admin/orders');
    }
    if (String(order.trangthai) !== 'returned') {
      req.flash('error', 'Đơn hàng chưa ở trạng thái đã nhận hàng hoàn.');
      return res.redirect(`/admin/orders/${id}`);
    }

    const refundMethod = String((order.yeucauhoanhang && order.yeucauhoanhang.refundMethod) || order.phuongthucthanhtoan || 'bank');
    const soTienHoan = Number(order.tongtien || order.tamtinh || 0);

    if (refundMethod === 'momo' || String(order.phuongthucthanhtoan || '') === 'momo') {
      if (!order.momoTransId) {
        req.flash('error', 'Không tìm thấy mã giao dịch MoMo để hoàn tiền.');
        return res.redirect(`/admin/orders/${id}`);
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
          req.flash('error', ketqua?.message || 'Yêu cầu hoàn tiền MoMo thất bại.');
          return res.redirect(`/admin/orders/${id}`);
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

    req.flash('success', 'Đã hoàn tiền thành công.');
    return res.redirect(`/admin/orders/${id}`);
  } catch (err) {
    console.error('refund order error:', err);
    req.flash('error', 'Không thể hoàn tiền đơn hàng.');
    return res.redirect(`/admin/orders/${req.params.id}`);
  }
};

module.exports.capNhatTrangThaiHangLoat = async (req, res) => {
  try {
    const nextStatus = String(req.body.status || '').trim();
    const returnToListPath =
      layDuongDanDanhSachHopLe(req.body.returnTo) ||
      layDuongDanDanhSachHopLe(req.get('referer')) ||
      '/admin/orders';

    const rawOrderIds = Array.isArray(req.body.orderIds)
      ? req.body.orderIds
      : (req.body.orderIds ? [req.body.orderIds] : []);

    const orderIds = Array.from(new Set(
      rawOrderIds
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    ));

    if (!orderIds.length) {
      req.flash('error', 'Vui lòng chọn ít nhất một đơn hàng');
      return res.redirect(returnToListPath);
    }

    if (!TAP_TRANG_THAI.has(nextStatus) || nextStatus === 'dahuy') {
      req.flash('error', 'Trạng thái cập nhật không hợp lệ');
      return res.redirect(returnToListPath);
    }

    const orders = await Donhang.find({
      _id: { $in: orderIds },
      daxoa: { $ne: true }
    }).lean();

    let updatedCount = 0;
    let skippedCount = 0;
    let mailErrorCount = 0;

    for (const order of (orders || [])) {
      const allowedNext = CHUYEN_TRANG_THAI[order.trangthai] || [];
      if (!allowedNext.includes(nextStatus)) {
        skippedCount += 1;
        continue;
      }

      const updateResult = await Donhang.updateOne(
        { _id: order._id, trangthai: order.trangthai, daxoa: { $ne: true } },
        { $set: { trangthai: nextStatus, ngaycapnhat: new Date() } }
      );

      if (!updateResult || Number(updateResult.modifiedCount || 0) === 0) {
        skippedCount += 1;
        continue;
      }

      updatedCount += 1;

      try {
        if (nextStatus === 'daxacnhan') {
          await createExportReceiptFromOrder({
            orderId: order._id,
            adminUser: req.adminUser || req.user,
            note: 'Tự động tạo khi đơn hàng được xác nhận (bulk)',
            skipInventoryAdjustments: true
          });
          await sendOrderConfirmedEmail({ orderId: order._id });
        }
        if (nextStatus === 'dagiao') {
          await sendOrderDeliveredEmail({ orderId: order._id });
        }
      } catch (mailError) {
        if (nextStatus === 'daxacnhan') {
          await Donhang.updateOne(
            { _id: order._id, trangthai: nextStatus, daxoa: { $ne: true } },
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
      req.flash('error', 'Không có đơn nào được cập nhật trạng thái');
      return res.redirect(returnToListPath);
    }

    let message = `Đã cập nhật ${updatedCount} đơn hàng`;
    if (skippedCount > 0) message += `, bỏ qua ${skippedCount} đơn không đúng luồng`;
    if (mailErrorCount > 0) message += `, ${mailErrorCount} đơn gửi email thất bại`;
    req.flash('success', message);
    return res.redirect(returnToListPath);
  } catch (err) {
    console.error('admin bulk update order status error:', err);
    req.flash('error', 'Không thể cập nhật trạng thái hàng loạt');
    const returnToListPath =
      layDuongDanDanhSachHopLe(req.body.returnTo) ||
      layDuongDanDanhSachHopLe(req.get('referer')) ||
      '/admin/orders';
    return res.redirect(returnToListPath);
  }
};

module.exports.huyDon = async (req, res) => {
  try {
    const id = req.params.id;
    const lydo = String(req.body.reason || '').trim() || 'Admin hủy đơn';

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/orders');
    }

    const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } }).lean();
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect('/admin/orders');
    }

    if (!['choxacnhan', 'daxacnhan'].includes(order.trangthai)) {
      req.flash('error', 'Đơn hàng không thể hủy ở trạng thái hiện tại');
      return res.redirect(`/admin/orders/${id}`);
    }

    if (order.dathanhtoan) {
      req.flash('error', 'Không thể hủy đơn đã thanh toán');
      return res.redirect(`/admin/orders/${id}`);
    }

    const updated = await Donhang.findOneAndUpdate(
      { _id: id, daxoa: { $ne: true }, trangthai: order.trangthai },
      { $set: { trangthai: 'dahuy', lydohuy: lydo, ngaycapnhat: new Date() } },
      { new: true }
    );

    if (!updated) {
      req.flash('error', 'Không thể hủy đơn hàng');
      return res.redirect(`/admin/orders/${id}`);
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
      req.flash('error', 'Đã hủy đơn nhưng có lỗi khi hoàn tồn kho cho một số sản phẩm.');
      return res.redirect(`/admin/orders/${updated._id}`);
    }

    req.flash('success', 'Đã hủy đơn hàng');
    return res.redirect('/admin/orders');
  } catch (err) {
    console.error('admin cancel order error:', err);
    req.flash('error', 'Không thể hủy đơn hàng');
    return res.redirect(`/admin/orders/${req.params.id}`);
  }
};
