const brandsService = require('../../../services/catalog/admin-brands.service');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

function traKetQua(res, result, fallbackCode) {
  if (!result.ok) {
    return traJsonThatBai(res, {
      status: result.status || 400,
      code: result.code || fallbackCode,
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
    const result = await brandsService.layDanhSachThuongHieu();
    return traKetQua(res, result, 'BRANDS_LIST_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BRANDS_LIST_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await brandsService.taoThuongHieu({ body: req.body || {}, file: req.file });
    return traKetQua(res, result, 'BRAND_CREATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BRAND_CREATE_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await brandsService.capNhatThuongHieu({ id: req.params.id, body: req.body || {}, file: req.file });
    return traKetQua(res, result, 'BRAND_UPDATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BRAND_UPDATE_FAILED', message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await brandsService.xoaThuongHieu({ id: req.params.id });
    return traKetQua(res, result, 'BRAND_DELETE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BRAND_DELETE_FAILED', message: error.message });
  }
};

module.exports.capNhatNoiBat = async (req, res) => {
  try {
    const result = await brandsService.capNhatNoiBat({ id: req.params.id, body: req.body || {} });
    return traKetQua(res, result, 'BRAND_FEATURED_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BRAND_FEATURED_FAILED', message: error.message });
  }
};

module.exports.capNhatHienThi = async (req, res) => {
  try {
    const result = await brandsService.capNhatHienThi({ id: req.params.id, body: req.body || {} });
    return traKetQua(res, result, 'BRAND_ACTIVE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BRAND_ACTIVE_FAILED', message: error.message });
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const result = await brandsService.sapXepThuongHieu({ items: Array.isArray(req.body.items) ? req.body.items : [] });
    return traKetQua(res, result, 'BRAND_SORT_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BRAND_SORT_FAILED', message: error.message });
  }
};
