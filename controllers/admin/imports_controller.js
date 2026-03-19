const importsService = require('../../services/inventory/admin-imports.service.js');

function adminBase(req) {
  return req.app.locals.admin || '/admin';
}

const danhSach = async (req, res) => {
  try {
    const viewData = await importsService.getDanhSachData(req.query || {});
    res.render('admin/pages/imports/index.pug', viewData);
  } catch (error) {
    console.error('Load import receipts error:', error);
    res.status(500).send('Không tải được danh sách phiếu nhập');
  }
};

const taoMoi = async (req, res) => {
  try {
    const viewData = await importsService.getTaoMoiData();
    res.render('admin/pages/imports/create.pug', viewData);
  } catch (error) {
    console.error('Create import receipt page error:', error);
    res.status(500).send('Không thể tải trang nhập kho');
  }
};

const taoMoiPost = async (req, res) => {
  try {
    const result = await importsService.taoMoiPhieuNhap({
      body: req.body || {},
      files: req.files || [],
      adminUser: req.adminUser,
      user: req.user
    });

    if (!result.ok) {
      req.flash('error', result.message);
      return res.redirect(req.get('Referrer') || `${adminBase(req)}/imports/create`);
    }

    req.flash('success', result.message);
    return res.redirect(`${adminBase(req)}/imports`);
  } catch (error) {
    console.error('Create import receipt error:', error);
    req.flash('error', `Không thể tạo phiếu nhập: ${error.message}`);
    return res.redirect(req.get('Referrer') || `${adminBase(req)}/imports/create`);
  }
};

const chiTiet = async (req, res) => {
  try {
    const result = await importsService.getChiTietData(req.params.id);
    if (!result.ok) return res.status(404).send(result.message);

    return res.render('admin/pages/imports/show.pug', result.data);
  } catch (error) {
    console.error('Import receipt detail error:', error);
    return res.status(500).send('Không tải được chi tiết phiếu nhập');
  }
};

const chinhSua = async (req, res) => {
  try {
    const result = await importsService.getChinhSuaData(req.params.id);
    if (!result.ok) return res.status(404).send(result.message);

    return res.render('admin/pages/imports/edit.pug', result.data);
  } catch (error) {
    console.error('Import receipt edit page error:', error);
    return res.status(500).send('Không thể tải trang chỉnh sửa phiếu nhập');
  }
};

const chinhSuaPost = async (req, res) => {
  try {
    const result = await importsService.chinhSuaPhieuNhap({
      id: req.params.id,
      body: req.body || {},
      files: req.files || [],
      adminUser: req.adminUser,
      user: req.user
    });

    if (!result.ok) {
      req.flash('error', result.message);
      return res.redirect(req.get('Referrer') || `${adminBase(req)}/imports/${result.receiptId || req.params.id}/edit`);
    }

    req.flash('success', result.message);
    return res.redirect(`${adminBase(req)}/imports/${result.receiptId}`);
  } catch (error) {
    console.error('Import receipt edit save error:', error);
    req.flash('error', `Không thể lưu chỉnh sửa: ${error.message}`);
    return res.redirect(req.get('Referrer') || `${adminBase(req)}/imports/${req.params.id}/edit`);
  }
};

const xoaPhieu = async (req, res) => {
  try {
    const result = await importsService.xoaPhieuNhap(req.params.id);
    if (!result.ok) {
      req.flash('error', result.message);
      if (result.receiptId) return res.redirect(`${adminBase(req)}/imports/${result.receiptId}`);
      return res.redirect(`${adminBase(req)}/imports`);
    }

    req.flash('success', result.message);
    return res.redirect(`${adminBase(req)}/imports`);
  } catch (error) {
    console.error('Delete import receipt error:', error);
    req.flash('error', `Không thể xóa phiếu nhập: ${error.message}`);
    return res.redirect(req.get('Referrer') || `${adminBase(req)}/imports`);
  }
};

const xuatKhoPhieuPost = async (req, res) => {
  try {
    const result = await importsService.xuatKhoPhieuNhap({
      id: req.params.id,
      adminUser: req.adminUser,
      user: req.user
    });

    if (!result.ok) {
      req.flash('error', result.message);
      if (result.receiptId) return res.redirect(`${adminBase(req)}/imports/${result.receiptId}`);
      return res.redirect(`${adminBase(req)}/imports`);
    }

    req.flash('success', result.message);
    return res.redirect(`${adminBase(req)}/imports/${result.receiptId}`);
  } catch (error) {
    console.error('Export import receipt error:', error);
    req.flash('error', `Không thể xuất kho phiếu nhập: ${error.message}`);
    return res.redirect(req.get('Referrer') || `${adminBase(req)}/imports`);
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chiTiet,
  chinhSua,
  chinhSuaPost,
  xoaPhieu,
  xuatKhoPhieuPost
};
