const ordersAdminService = require('../../../services/order/admin-orders.service.js');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

function traKetQua(res, result, codeFallback) {
  if (!result || !result.ok) {
    return traJsonThatBai(res, {
      status: result?.status || 400,
      code: result?.code || codeFallback,
      message: result?.message || 'Yeu cau that bai'
    });
  }

  return traJsonThanhCong(res, {
    status: result.status || 200,
    message: result.message,
    data: result.data || null
  });
}

module.exports.danhSach = async (req, res) => {
  try {
    const data = await ordersAdminService.getDanhSachData(req.query || {});
    return traJsonThanhCong(res, { status: 200, data });
  } catch (error) {
    console.error('orders.api.danhSach error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDERS_LIST_FAILED', message: 'Khong the lay danh sach don hang' });
  }
};

module.exports.chiTiet = async (req, res) => {
  try {
    const result = await ordersAdminService.getChiTietData(req.params.id);
    return traKetQua(res, result, 'ORDER_DETAIL_FAILED');
  } catch (error) {
    console.error('orders.api.chiTiet error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_DETAIL_FAILED', message: 'Khong the lay chi tiet don hang' });
  }
};

module.exports.tongQuanDonMoi = async (req, res) => {
  try {
    const data = await ordersAdminService.getTongQuanDonMoiData();
    return traJsonThanhCong(res, {
      status: 200,
      data: {
        count: Number(data.count || 0),
        latestOrder: data.latestOrder || null
      }
    });
  } catch (error) {
    console.error('orders.api.tongQuanDonMoi error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDERS_NEW_SUMMARY_FAILED', message: 'Khong the lay so luong don moi' });
  }
};

module.exports.capNhatTrangThai = async (req, res) => {
  try {
    const result = await ordersAdminService.capNhatTrangThaiDon({
      id: req.params.id,
      nextStatus: String(req.body.status || req.body.trangthai || '').trim(),
      actor: req.user || req.adminUser || null
    });
    return traKetQua(res, result, 'ORDER_STATUS_UPDATE_FAILED');
  } catch (error) {
    console.error('orders.api.capNhatTrangThai error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_STATUS_UPDATE_FAILED', message: 'Khong the cap nhat trang thai don hang' });
  }
};

module.exports.duyetHoanHang = async (req, res) => {
  try {
    const result = await ordersAdminService.duyetHoanHang({
      id: req.params.id,
      note: req.body.note || req.body.adminNote
    });
    return traKetQua(res, result, 'ORDER_APPROVE_RETURN_FAILED');
  } catch (error) {
    console.error('orders.api.duyetHoanHang error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_APPROVE_RETURN_FAILED', message: 'Khong the duyet yeu cau hoan hang' });
  }
};

module.exports.tuChoiHoanHang = async (req, res) => {
  try {
    const result = await ordersAdminService.tuChoiHoanHang({
      id: req.params.id,
      note: req.body.note || req.body.adminNote
    });
    return traKetQua(res, result, 'ORDER_REJECT_RETURN_FAILED');
  } catch (error) {
    console.error('orders.api.tuChoiHoanHang error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_REJECT_RETURN_FAILED', message: 'Khong the tu choi yeu cau hoan hang' });
  }
};

module.exports.xacNhanDaNhanHangHoan = async (req, res) => {
  try {
    const result = await ordersAdminService.xacNhanDaNhanHangHoan({
      id: req.params.id,
      payload: req.body || {},
      actor: req.user || req.adminUser || null
    });
    return traKetQua(res, result, 'ORDER_CONFIRM_RETURN_RECEIVED_FAILED');
  } catch (error) {
    console.error('orders.api.xacNhanDaNhanHangHoan error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_CONFIRM_RETURN_RECEIVED_FAILED', message: 'Khong the xac nhan nhan hang hoan' });
  }
};

module.exports.hoanTienDon = async (req, res) => {
  try {
    const result = await ordersAdminService.hoanTienDon(req.params.id);
    return traKetQua(res, result, 'ORDER_REFUND_FAILED');
  } catch (error) {
    console.error('orders.api.hoanTienDon error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_REFUND_FAILED', message: 'Khong the hoan tien don hang' });
  }
};

module.exports.capNhatTrangThaiHangLoat = async (req, res) => {
  try {
    const result = await ordersAdminService.capNhatTrangThaiHangLoat({
      orderIds: req.body.orderIds,
      nextStatus: req.body.status || req.body.trangthai,
      actor: req.user || req.adminUser || null
    });
    return traKetQua(res, result, 'ORDER_BULK_STATUS_UPDATE_FAILED');
  } catch (error) {
    console.error('orders.api.capNhatTrangThaiHangLoat error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_BULK_STATUS_UPDATE_FAILED', message: 'Khong the cap nhat trang thai hang loat' });
  }
};

module.exports.huyDon = async (req, res) => {
  try {
    const result = await ordersAdminService.huyDon({
      id: req.params.id,
      reason: req.body.reason || req.body.lydohuy
    });
    return traKetQua(res, result, 'ORDER_CANCEL_FAILED');
  } catch (error) {
    console.error('orders.api.huyDon error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_CANCEL_FAILED', message: 'Khong the huy don hang' });
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
    console.error('orders.api.exportExcel error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDER_EXPORT_EXCEL_FAILED', message: 'Khong the xuat file Excel don hang' });
  }
};
