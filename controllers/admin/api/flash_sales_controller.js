const flashSalesService = require('../../../services/catalog/admin-flash-sales.service.js');
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
    const data = await flashSalesService.getDanhSachData();
    return traJsonThanhCong(res, { data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'FLASH_SALES_LIST_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await flashSalesService.taoMoiFlashSale(req.body || {});
    return traKetQua(res, result, 'FLASH_SALE_CREATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'FLASH_SALE_CREATE_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await flashSalesService.capNhatFlashSale(req.params.id, req.body || {});
    return traKetQua(res, result, 'FLASH_SALE_UPDATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'FLASH_SALE_UPDATE_FAILED', message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await flashSalesService.xoaFlashSale(req.params.id);
    return traKetQua(res, result, 'FLASH_SALE_DELETE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'FLASH_SALE_DELETE_FAILED', message: error.message });
  }
};

module.exports.batTat = async (req, res) => {
  try {
    const result = await flashSalesService.batTatFlashSale(req.params.id);
    return traKetQua(res, result, 'FLASH_SALE_TOGGLE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'FLASH_SALE_TOGGLE_FAILED', message: error.message });
  }
};
