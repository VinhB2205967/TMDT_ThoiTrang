const homeSectionsService = require('../../../services/content/admin-home-sections.service.js');
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
    const result = await homeSectionsService.layDanhSachHomeSections();
    return traKetQua(res, result, 'HOME_SECTIONS_LIST_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'HOME_SECTIONS_LIST_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await homeSectionsService.capNhatHomeSection({ key: req.params.key, body: req.body || {} });
    return traKetQua(res, result, 'HOME_SECTION_UPDATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'HOME_SECTION_UPDATE_FAILED', message: error.message });
  }
};

module.exports.batTat = async (req, res) => {
  try {
    const result = await homeSectionsService.batTatHomeSection({ key: req.params.key });
    return traKetQua(res, result, 'HOME_SECTION_TOGGLE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'HOME_SECTION_TOGGLE_FAILED', message: error.message });
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const result = await homeSectionsService.sapXepHomeSections({ items: Array.isArray(req.body.items) ? req.body.items : [] });
    return traKetQua(res, result, 'HOME_SECTION_SORT_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'HOME_SECTION_SORT_FAILED', message: error.message });
  }
};
