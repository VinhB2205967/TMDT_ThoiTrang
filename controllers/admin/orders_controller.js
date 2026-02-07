const mongoose = require('mongoose');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const paginationHelper = require('../../helpers/pagination');
const { thoatBieuThuc } = require('../../helpers/validators');
const { layTrangThaiChoPhep } = require('../../helpers/orderStatus');
const { laLoaiKhongSize, tinhTongTon } = require('../../services/productStock.service');
const { danhDauThatBaiTatCaPendingTheoDonHang } = require('../../services/payment.service');

const TRANG_THAI_CHO_PHEP = layTrangThaiChoPhep().filter((s) => s !== 'all');
const TAP_TRANG_THAI = new Set(TRANG_THAI_CHO_PHEP);

const CHUYEN_TRANG_THAI = {
  choxacnhan: ['daxacnhan', 'dahuy'],
  daxacnhan: ['dangchuanbi', 'dahuy'],
  dangchuanbi: ['danggiao'],
  danggiao: ['dagiao'],
  dagiao: [],
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
      return { ngaytao: 1 };
    case 'total-asc':
      return { tongtien: 1, tamtinh: 1 };
    case 'total-desc':
      return { tongtien: -1, tamtinh: -1 };
    case 'newest':
    default:
      return { ngaytao: -1, ngaycapnhat: -1 };
  }
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
      filterString
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
      filterString: ''
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

    const items = await Chitietdonhang.find({ donhang_id: order._id }).lean();
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

    const header = ['MaDon', 'KhachHang', 'SDT', 'Email', 'ThanhToan', 'TrangThai', 'TongTien', 'NgayTao'];
    const lines = [header.join(',')];
    for (const o of (rows || [])) {
      const line = [
        o.madonhang || '',
        (o.tennguoinhan || '').replace(/\n|\r|,/g, ' '),
        o.sodienthoai || '',
        o.email || '',
        (o.phuongthucthanhtoan || '').toUpperCase(),
        layNhanTrangThai(o.trangthai),
        Number(o.tongtien || o.tamtinh || 0),
        o.ngaytao ? new Date(o.ngaytao).toISOString() : ''
      ];
      lines.push(line.join(','));
    }

    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders_export.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    console.error('admin orders export error:', err);
    req.flash('error', 'Không thể xuất danh sách đơn hàng');
    return res.redirect('/admin/orders');
  }
};

module.exports.capNhatTrangThai = async (req, res) => {
  try {
    const id = req.params.id;
    const nextStatus = String(req.body.status || '').trim();

    const referer = String(req.get('referer') || '');
    const returnToList = referer.includes('/admin/orders') && !referer.includes(`/admin/orders/${id}`);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect(returnToList ? '/admin/orders' : `/admin/orders/${id}`);
    }

    if (!TAP_TRANG_THAI.has(nextStatus) || nextStatus === 'dahuy') {
      req.flash('error', 'Trạng thái không hợp lệ');
      return res.redirect(returnToList ? '/admin/orders' : `/admin/orders/${id}`);
    }

    const order = await Donhang.findOne({ _id: id, daxoa: { $ne: true } }).lean();
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect(returnToList ? '/admin/orders' : `/admin/orders/${id}`);
    }

    const allowedNext = CHUYEN_TRANG_THAI[order.trangthai] || [];
    if (!allowedNext.includes(nextStatus)) {
      req.flash('error', 'Không thể chuyển trạng thái theo luồng hiện tại');
      return res.redirect(returnToList ? '/admin/orders' : `/admin/orders/${id}`);
    }

    await Donhang.updateOne(
      { _id: id, trangthai: order.trangthai, daxoa: { $ne: true } },
      { $set: { trangthai: nextStatus, ngaycapnhat: new Date() } }
    );

    req.flash('success', 'Cập nhật trạng thái thành công');
    return res.redirect(returnToList ? '/admin/orders' : `/admin/orders/${id}`);
  } catch (err) {
    console.error('admin update order status error:', err);
    req.flash('error', 'Không thể cập nhật trạng thái đơn hàng');
    const referer = String(req.get('referer') || '');
    if (referer.includes('/admin/orders') && !referer.includes(`/admin/orders/${req.params.id}`)) {
      return res.redirect('/admin/orders');
    }
    return res.redirect(`/admin/orders/${req.params.id}`);
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
