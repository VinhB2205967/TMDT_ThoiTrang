const importsService = require('../../../services/inventory/admin-imports.service.js');
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
    const data = await importsService.getDanhSachData(req.query || {});
    return traJsonThanhCong(res, { data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'IMPORTS_LIST_FAILED', message: error.message });
  }
};

module.exports.duLieuTaoMoi = async (req, res) => {
  try {
    const data = await importsService.getTaoMoiData();
    return traJsonThanhCong(res, { data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'IMPORT_CREATE_DATA_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await importsService.taoMoiPhieuNhap({
      body: req.body || {},
      files: req.files || [],
      adminUser: req.adminUser,
      user: req.user
    });
    return traKetQua(res, result, 'IMPORT_CREATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'IMPORT_CREATE_FAILED', message: error.message });
  }
};

module.exports.chiTiet = async (req, res) => {
  try {
    const result = await importsService.getChiTietData(req.params.id);
    return traKetQua(res, result, 'IMPORT_DETAIL_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'IMPORT_DETAIL_FAILED', message: error.message });
  }
};

module.exports.duLieuChinhSua = async (req, res) => {
  try {
    const result = await importsService.getChinhSuaData(req.params.id);
    return traKetQua(res, result, 'IMPORT_EDIT_DATA_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'IMPORT_EDIT_DATA_FAILED', message: error.message });
  }
};

module.exports.chinhSua = async (req, res) => {
  try {
    const result = await importsService.chinhSuaPhieuNhap({
      id: req.params.id,
      body: req.body || {},
      files: req.files || [],
      adminUser: req.adminUser,
      user: req.user
    });
    return traKetQua(res, result, 'IMPORT_EDIT_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'IMPORT_EDIT_FAILED', message: error.message });
  }
};

module.exports.xoaPhieu = async (req, res) => {
  try {
    const result = await importsService.xoaPhieuNhap(req.params.id);
    return traKetQua(res, result, 'IMPORT_DELETE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'IMPORT_DELETE_FAILED', message: error.message });
  }
};

module.exports.xuatKhoPhieu = async (req, res) => {
  try {
    const result = await importsService.xuatKhoPhieuNhap({
      id: req.params.id,
      adminUser: req.adminUser,
      user: req.user
    });
    return traKetQua(res, result, 'IMPORT_EXPORT_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'IMPORT_EXPORT_FAILED', message: error.message });
  }
};
