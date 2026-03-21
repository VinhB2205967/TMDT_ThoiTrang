const exportsService = require('../../../services/inventory/admin-exports.service.js');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

function traKetQua(res, result, codeFallback) {
  if (!result.ok) {
    return traJsonThatBai(res, {
      status: result.status || 400,
      code: result.code || codeFallback,
      message: result.message
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
    const result = await exportsService.getDanhSachData();
    return traKetQua(res, result, 'EXPORT_LIST_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'EXPORT_LIST_FAILED', message: error.message });
  }
};

module.exports.duLieuTaoMoi = async (req, res) => {
  try {
    const result = await exportsService.getTaoMoiData();
    return traKetQua(res, result, 'EXPORT_CREATE_DATA_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'EXPORT_CREATE_DATA_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await exportsService.taoPhieuXuat({
      body: req.body || {},
      adminUser: req.adminUser || null,
      user: req.user || null
    });
    return traKetQua(res, result, 'EXPORT_CREATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'EXPORT_CREATE_FAILED', message: error.message });
  }
};

module.exports.chiTiet = async (req, res) => {
  try {
    const result = await exportsService.getChiTietData(req.params.id);
    return traKetQua(res, result, 'EXPORT_DETAIL_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'EXPORT_DETAIL_FAILED', message: error.message });
  }
};
