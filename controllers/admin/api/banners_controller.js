const bannersService = require('../../../services/content/admin-banners.service');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.danhSach = async (req, res) => {
  try {
    const result = await bannersService.layDanhSachBanner();
    return traJsonThanhCong(res, { status: 200, data: result.data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BANNERS_LIST_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await bannersService.taoBanner({ body: req.body || {}, file: req.file });
    if (!result.ok) return traJsonThatBai(res, { status: result.status, code: result.code, message: result.message });
    return traJsonThanhCong(res, { status: result.status || 201, message: result.message, data: result.data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BANNER_CREATE_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await bannersService.capNhatBanner({ id: req.params.id, body: req.body || {}, file: req.file });
    if (!result.ok) return traJsonThatBai(res, { status: result.status, code: result.code, message: result.message });
    return traJsonThanhCong(res, { status: result.status || 200, message: result.message, data: result.data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BANNER_UPDATE_FAILED', message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await bannersService.xoaBanner({ id: req.params.id });
    if (!result.ok) return traJsonThatBai(res, { status: result.status, code: result.code, message: result.message });
    return traJsonThanhCong(res, { status: result.status || 200, message: result.message, data: null });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BANNER_DELETE_FAILED', message: error.message });
  }
};

module.exports.batTat = async (req, res) => {
  try {
    const result = await bannersService.batTatBanner({ id: req.params.id });
    if (!result.ok) return traJsonThatBai(res, { status: result.status, code: result.code, message: result.message });
    return traJsonThanhCong(res, { status: result.status || 200, message: result.message, data: result.data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BANNER_TOGGLE_FAILED', message: error.message });
  }
};
