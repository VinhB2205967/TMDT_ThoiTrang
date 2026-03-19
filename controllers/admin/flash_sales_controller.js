const adminFlashSalesService = require('../../services/catalog/admin-flash-sales.service.js');

module.exports.danhSach = async (req, res) => {
  const data = await adminFlashSalesService.getDanhSachData();
  const want = req.accepts(['html', 'json']);
  if (want === 'html') {
    const products = await adminFlashSalesService.getProductsForAdminForm();
    return res.render('admin/pages/home/flash_sales.pug', {
      titlePage: 'Quản lý Flash Sale',
      flashSales: data,
      products
    });
  }
  return res.json({ success: true, data });
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await adminFlashSalesService.taoMoiFlashSale(req.body || {});
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    const message = error && error.message ? error.message : 'Không thể tạo Flash Sale';
    res.status(400).json({ success: false, message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await adminFlashSalesService.capNhatFlashSale(req.params.id, req.body || {});
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    res.json({ success: true, data: result.data });
  } catch (error) {
    const message = error && error.message ? error.message : 'Không thể cập nhật Flash Sale';
    res.status(400).json({ success: false, message });
  }
};

module.exports.xoa = async (req, res) => {
  const result = await adminFlashSalesService.xoaFlashSale(req.params.id);
  if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
  res.json({ success: true, message: result.message });
};

module.exports.batTat = async (req, res) => {
  const result = await adminFlashSalesService.batTatFlashSale(req.params.id);
  if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
  res.json({ success: true, data: result.data });
};
