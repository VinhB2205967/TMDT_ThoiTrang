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
      return res.redirect(ordersAdminService.layDuongDanDanhSachMacDinh());
    }

    const data = result.data;
    const currentListUrl = ordersAdminService.layDuongDanQuayLaiDanhSach({ fromQuery: req.query.returnTo });

    return res.render('admin/pages/orders/detail', {
      ...data,
      currentListUrl
    });
  } catch (err) {
    console.error('orders.chiTiet error:', err);
    req.flash('error', 'Không thể tải chi tiết đơn hàng');
    return res.redirect(ordersAdminService.layDuongDanDanhSachMacDinh());
  }
};

module.exports.exportExcel = async (req, res) => {
  try {
    const workbook = await ordersAdminService.buildExportWorkbook(req.query || {});
    const fileName = ordersAdminService.taoTenFileXuatDonHang();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('orders.exportExcel error:', error);
    req.flash('error', 'Không thể xuất file Excel. Vui lòng thử lại.');
    return res.redirect(ordersAdminService.layDuongDanDanhSachMacDinh());
  }
};

module.exports.capNhatTrangThai = async (req, res) => {
  const id = req.params.id;
  const nextStatus = String(req.body.status || req.body.trangthai || '').trim();
  const returnTo = ordersAdminService.layDuongDanQuayLaiDanhSach({
    fromBody: req.body.returnTo,
    fromQuery: req.query.returnTo
  });
  const detailRedirectUrl = ordersAdminService.taoDuongDanChiTietDon({ id, returnTo });

  try {
    const result = await ordersAdminService.capNhatTrangThaiDon({
      id,
      nextStatus,
      actor: req.user
    });

    const flashType = ordersAdminService.xacDinhLoaiFlashKetQua(result, {
      warningCodes: ['MAIL_ERROR']
    });
    req.flash(flashType, result.message || 'Cập nhật trạng thái thành công');
    return res.redirect(detailRedirectUrl);
  } catch (err) {
    console.error('orders.capNhatTrangThai error:', err);
    req.flash('error', 'Lỗi hệ thống khi cập nhật trạng thái');
    return res.redirect(detailRedirectUrl);
  }
};

module.exports.duyetHoanHang = async (req, res) => {
  try {
    const result = await ordersAdminService.duyetHoanHang({
      id: req.params.id,
      note: req.body.note || req.body.adminNote
    });
    req.flash(ordersAdminService.xacDinhLoaiFlashKetQua(result), result.message);
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
      note: req.body.note || req.body.adminNote
    });
    req.flash(ordersAdminService.xacDinhLoaiFlashKetQua(result), result.message);
  } catch (err) {
    console.error('tuChoiHoanHang error:', err);
    req.flash('error', 'Có lỗi khi từ chối hoàn hàng');
  }

  return res.redirect('back');
};

module.exports.xacNhanDaNhanHangHoan = async (req, res) => {
  try {
    const result = await ordersAdminService.xacNhanDaNhanHangHoan(req.params.id);
    req.flash(ordersAdminService.xacDinhLoaiFlashKetQua(result), result.message);
  } catch (err) {
    console.error('xacNhanDaNhanHangHoan error:', err);
    req.flash('error', 'Có lỗi khi xác nhận nhận hàng hoàn');
  }

  return res.redirect('back');
};

module.exports.hoanTienDon = async (req, res) => {
  try {
    const result = await ordersAdminService.hoanTienDon(req.params.id);
    req.flash(ordersAdminService.xacDinhLoaiFlashKetQua(result), result.message);
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

    req.flash(ordersAdminService.xacDinhLoaiFlashKetQua(result), result.message);
    return res.redirect(ordersAdminService.layDuongDanDanhSachMacDinh());
  } catch (err) {
    console.error('orders.capNhatTrangThaiHangLoat error:', err);
    req.flash('error', 'Lỗi hệ thống khi cập nhật hàng loạt');
    return res.redirect(ordersAdminService.layDuongDanDanhSachMacDinh());
  }
};

module.exports.huyDon = async (req, res) => {
  try {
    const result = await ordersAdminService.huyDon({
      id: req.params.id,
      reason: req.body.reason || req.body.lydohuy
    });

    req.flash(
      ordersAdminService.xacDinhLoaiFlashKetQua(result, { warningWhenPartial: true }),
      result.message
    );
    return res.redirect(ordersAdminService.layDuongDanDanhSachMacDinh());
  } catch (err) {
    console.error('orders.huyDon error:', err);
    req.flash('error', 'Lỗi hệ thống khi hủy đơn');
    return res.redirect(ordersAdminService.layDuongDanDanhSachMacDinh());
  }
};
