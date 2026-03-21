const sizeGuidesService = require('../../../services/catalog/admin-size-guides.service.js');
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

module.exports.danhSach = async (_req, res) => {
  try {
    const result = await sizeGuidesService.getDanhSachData();
    return traKetQua(res, { ok: true, status: 200, data: result.data.guides }, 'SIZE_GUIDES_LIST_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'SIZE_GUIDES_LIST_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await sizeGuidesService.taoMoiGuide(req.body || {});
    return traKetQua(res, result, 'SIZE_GUIDE_CREATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'SIZE_GUIDE_CREATE_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await sizeGuidesService.capNhatGuide(req.params.id, req.body || {});
    return traKetQua(res, result, 'SIZE_GUIDE_UPDATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'SIZE_GUIDE_UPDATE_FAILED', message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await sizeGuidesService.xoaGuide(req.params.id);
    return traKetQua(res, result, 'SIZE_GUIDE_DELETE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'SIZE_GUIDE_DELETE_FAILED', message: error.message });
  }
};
