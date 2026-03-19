const ordersAdminService = require('../../services/order/admin-orders.service.js');

module.exports.danhSach = async (req, res) => {
  try {
    const viewData = await ordersAdminService.getDanhSachData(req.query || {});
    res.render('admin/pages/orders/index', viewData);
  } catch (err) {
    console.error('orders.danhSach error:', err);
    req.flash('error', 'Không thể tải danh sách đơn hàng');
    res.render('admin/pages/orders/index', ordersAdminService.getDanhSachFallbackData());
  }
};

module.exports.chiTiet = async (req, res) => {
  try {
    const result = await ordersAdminService.getChiTietData(req.params.id);
    if (!result.ok) {
      req.flash('error', result.message || 'Không tìm thấy đơn hàng');
      return res.redirect('/admin/orders');
    }

    const data = result.data;
    const currentListUrl = ordersAdminService.layDuongDanDanhSachHopLe(req.query.returnTo) || '/admin/orders';

    return res.render('admin/pages/orders/detail', {
      ...data,
      currentListUrl
    });
  } catch (err) {
    console.error('orders.chiTiet error:', err);
    req.flash('error', 'Không thể tải chi tiết đơn hàng');
    return res.redirect('/admin/orders');
  }
};

module.exports.exportExcel = async (req, res) => {
  try {
    const workbook = await ordersAdminService.buildExportWorkbook(req.query || {});
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fileName = `don-hang-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('orders.exportExcel error:', error);
    req.flash('error', 'Không thể xuất file Excel. Vui lòng thử lại.');
    return res.redirect('/admin/orders');
  }
};

module.exports.tongQuanDonMoi = async (req, res) => {
  try {
    const data = await ordersAdminService.getTongQuanDonMoiData();
    return res.json(data);
  } catch (error) {
    console.error('orders.tongQuanDonMoi error:', error);
    return res.status(500).json({ success: false, message: 'Không thể lấy số lượng đơn mới' });
  }
};

module.exports.capNhatTrangThai = async (req, res) => {
  const id = req.params.id;
  const nextStatus = String(req.body.trangthai || '').trim();
  const returnTo = ordersAdminService.layDuongDanDanhSachHopLe(req.body.returnTo) || ordersAdminService.layDuongDanDanhSachHopLe(req.query.returnTo) || '/admin/orders';

  try {
    const result = await ordersAdminService.capNhatTrangThaiDon({
      id,
      nextStatus,
      actor: req.user
    });

    if (!result.ok) {
      req.flash(result.code === 'MAIL_ERROR' ? 'warning' : 'error', result.message);
      return res.redirect(`/admin/orders/detail/${id}?returnTo=${encodeURIComponent(returnTo)}`);
    }

    req.flash('success', result.message || 'Cập nhật trạng thái thành công');
    return res.redirect(`/admin/orders/detail/${id}?returnTo=${encodeURIComponent(returnTo)}`);
  } catch (err) {
    console.error('orders.capNhatTrangThai error:', err);
    req.flash('error', 'Lỗi hệ thống khi cập nhật trạng thái');
    return res.redirect(`/admin/orders/detail/${id}?returnTo=${encodeURIComponent(returnTo)}`);
  }
};

module.exports.duyetHoanHang = async (req, res) => {
  try {
    const result = await ordersAdminService.duyetHoanHang({
      id: req.params.id,
      note: req.body.adminNote
    });
    req.flash(result.ok ? 'success' : 'error', result.message);
  } catch (err) {
    console.error('duyetHoanHang error:', err);
    req.flash('error', 'Có lỗi khi duyệt hoàn hàng');
  }

  return res.redirect('back');
};

module.exports.tuChoiHoanHang = async (req, res) => {
  try {
    const result = await ordersAdminService.tuChoiHoanHang({
      id: req.params.id,
      note: req.body.adminNote
    });
    req.flash(result.ok ? 'success' : 'error', result.message);
  } catch (err) {
    console.error('tuChoiHoanHang error:', err);
    req.flash('error', 'Có lỗi khi từ chối hoàn hàng');
  }

  return res.redirect('back');
};

module.exports.xacNhanDaNhanHangHoan = async (req, res) => {
  try {
    const result = await ordersAdminService.xacNhanDaNhanHangHoan(req.params.id);
    req.flash(result.ok ? 'success' : 'error', result.message);
  } catch (err) {
    console.error('xacNhanDaNhanHangHoan error:', err);
    req.flash('error', 'Có lỗi khi xác nhận nhận hàng hoàn');
  }

  return res.redirect('back');
};

module.exports.hoanTienDon = async (req, res) => {
  try {
    const result = await ordersAdminService.hoanTienDon(req.params.id);
    req.flash(result.ok ? 'success' : 'error', result.message);
  } catch (err) {
    console.error('hoanTienDon error:', err);
    req.flash('error', 'Có lỗi khi hoàn tiền');
  }

  return res.redirect('back');
};

module.exports.capNhatTrangThaiHangLoat = async (req, res) => {
  try {
    const result = await ordersAdminService.capNhatTrangThaiHangLoat({
      orderIds: req.body.orderIds,
      nextStatus: req.body.trangthai,
      actor: req.user
    });

    req.flash(result.ok ? 'success' : 'error', result.message);
    return res.redirect('/admin/orders');
  } catch (err) {
    console.error('orders.capNhatTrangThaiHangLoat error:', err);
    req.flash('error', 'Lỗi hệ thống khi cập nhật hàng loạt');
    return res.redirect('/admin/orders');
  }
};

module.exports.huyDon = async (req, res) => {
  try {
    const result = await ordersAdminService.huyDon({
      id: req.params.id,
      reason: req.body.lydohuy
    });

    req.flash(result.ok ? (result.isPartial ? 'warning' : 'success') : 'error', result.message);
    return res.redirect('/admin/orders');
  } catch (err) {
    console.error('orders.huyDon error:', err);
    req.flash('error', 'Lỗi hệ thống khi hủy đơn');
    return res.redirect('/admin/orders');
  }
};
