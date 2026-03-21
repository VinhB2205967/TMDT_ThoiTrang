const adminFlashSalesService = require('../../services/catalog/admin-flash-sales.service.js');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function xuLyKetQuaSSR(req, res, result) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, '/admin/flash-sales');
}

module.exports.danhSach = async (req, res) => {
  const data = await adminFlashSalesService.getDanhSachData();
  const products = await adminFlashSalesService.getProductsForAdminForm();
  return res.render('admin/pages/home/flash_sales.pug', {
    titlePage: 'Quản lý Flash Sale',
    flashSales: data,
    products
  });
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await adminFlashSalesService.taoMoiFlashSale(req.body || {});
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    const message = error && error.message ? error.message : 'Không thể tạo Flash Sale';
    return xuLyKetQuaSSR(req, res, { ok: false, message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await adminFlashSalesService.capNhatFlashSale(req.params.id, req.body || {});
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    const message = error && error.message ? error.message : 'Không thể cập nhật Flash Sale';
    return xuLyKetQuaSSR(req, res, { ok: false, message });
  }
};

module.exports.xoa = async (req, res) => {
  const result = await adminFlashSalesService.xoaFlashSale(req.params.id);
  return xuLyKetQuaSSR(req, res, result);
};

module.exports.batTat = async (req, res) => {
  const result = await adminFlashSalesService.batTatFlashSale(req.params.id);
  return xuLyKetQuaSSR(req, res, result);
};
