const lookbooksService = require('../../../services/content/admin-lookbooks.service');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

function traKetQua(res, result, codeFallback) {
  if (!result.ok) {
    return traJsonThatBai(res, {
      status: result.status || 400,
      code: result.code || codeFallback,
      message: result.message,
      errors: result.errors
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
    const result = await lookbooksService.layDanhSachLookbookData();
    return traKetQua(res, result, 'LOOKBOOKS_LIST_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'LOOKBOOKS_LIST_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await lookbooksService.taoLookbook({ body: req.body || {}, file: req.file || null });
    return traKetQua(res, result, 'LOOKBOOK_CREATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'LOOKBOOK_CREATE_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await lookbooksService.capNhatLookbook({ id: req.params.id, body: req.body || {}, file: req.file || null });
    return traKetQua(res, result, 'LOOKBOOK_UPDATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'LOOKBOOK_UPDATE_FAILED', message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await lookbooksService.xoaLookbook(req.params.id);
    return traKetQua(res, result, 'LOOKBOOK_DELETE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'LOOKBOOK_DELETE_FAILED', message: error.message });
  }
};

module.exports.batTat = async (req, res) => {
  try {
    const result = await lookbooksService.batTatLookbook(req.params.id);
    return traKetQua(res, result, 'LOOKBOOK_TOGGLE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'LOOKBOOK_TOGGLE_FAILED', message: error.message });
  }
};
