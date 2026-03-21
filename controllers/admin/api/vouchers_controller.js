const vouchersService = require('../../../services/payment/admin-vouchers.service.js');
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
    const result = await vouchersService.getDanhSachData(req.query || {});
    return traKetQua(res, { ok: true, status: 200, data: result.data }, 'VOUCHERS_LIST_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'VOUCHERS_LIST_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await vouchersService.taoMoiVoucher({ body: req.body || {}, file: req.file || null });
    return traKetQua(res, result, 'VOUCHER_CREATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'VOUCHER_CREATE_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await vouchersService.capNhatVoucher({ id: req.params.id, body: req.body || {}, file: req.file || null });
    return traKetQua(res, result, 'VOUCHER_UPDATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'VOUCHER_UPDATE_FAILED', message: error.message });
  }
};

module.exports.toggleStatus = async (req, res) => {
  try {
    const result = await vouchersService.toggleStatus(req.params.id);
    return traKetQua(res, result, 'VOUCHER_TOGGLE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'VOUCHER_TOGGLE_FAILED', message: error.message });
  }
};
