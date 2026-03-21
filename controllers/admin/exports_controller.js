const exportsService = require('../../services/inventory/admin-exports.service.js');
const systemConfig = require('../../config/system');

const danhSach = async (req, res) => {
  try {
    const viewData = await exportsService.getDanhSachViewData();
    return res.render('admin/pages/exports/index.pug', viewData);
  } catch (error) {
    console.error('Load export receipts error:', error);
    return res.status(500).send('Không tải được danh sách phiếu xuất');
  }
};

const taoMoi = async (req, res) => {
  try {
    const viewData = await exportsService.getTaoMoiViewData();
    return res.render('admin/pages/exports/create.pug', viewData);
  } catch (error) {
    console.error('Create export receipt page error:', error);
    return res.status(500).send('Không thể tải trang xuất kho');
  }
};

const taoMoiPost = async (req, res) => {
  try {
    const result = await exportsService.taoPhieuXuat({
      body: req.body || {},
      adminUser: req.adminUser || null,
      user: req.user || null
    });

    if (!result.ok) {
      req.flash('error', result.message || 'Không thể tạo phiếu xuất');
      return res.redirect(req.get('Referrer') || `${systemConfig.prefigAdmin}/exports/create`);
    }

    req.flash('success', result.message || 'Tạo phiếu xuất thành công');
    return res.redirect(`${systemConfig.prefigAdmin}/exports/${result.data._id}`);
  } catch (error) {
    console.error('Create export receipt error:', error);
    req.flash('error', `Không thể tạo phiếu xuất: ${error.message}`);
    return res.redirect(req.get('Referrer') || `${systemConfig.prefigAdmin}/exports/create`);
  }
};

const chiTiet = async (req, res) => {
  try {
    const result = await exportsService.getChiTietViewData(req.params.id);
    if (!result.ok) return res.status(result.status || 404).send(result.message || 'Không tìm thấy phiếu xuất');

    return res.render('admin/pages/exports/show.pug', result.data);
  } catch (error) {
    console.error('Export receipt detail error:', error);
    return res.status(500).send('Không tải được chi tiết phiếu xuất');
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chiTiet
};
