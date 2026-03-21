const vouchersService = require('../../services/payment/admin-vouchers.service.js');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function adminBase(req) {
  return req.app?.locals?.admin || '/admin';
}

function redirectBack(req, res) {
  return redirectBackOrDefault(req, res, `${adminBase(req)}/vouchers/create`);
}

module.exports.danhSach = async (req, res) => {
  try {
    const result = await vouchersService.getDanhSachData(req.query || {});
    res.render('admin/pages/vouchers/index.pug', result.data);
  } catch (error) {
    console.error('Load vouchers error:', error);
    res.status(500).send('Không thể tải danh sách voucher');
  }
};

module.exports.toggleStatus = async (req, res) => {
  try {
    const result = await vouchersService.toggleStatus(req.params.id);
    req.flash?.(result.ok ? 'success' : 'error', result.message);
    return redirectBackOrDefault(req, res, `${adminBase(req)}/vouchers`);
  } catch (error) {
    console.error('Toggle voucher status error:', error);
    req.flash?.('error', 'Không thể cập nhật trạng thái voucher');
    return redirectBackOrDefault(req, res, `${adminBase(req)}/vouchers`);
  }
};

module.exports.taoMoi = async (req, res) => {
  const result = vouchersService.getTaoMoiData();
  res.render('admin/pages/vouchers/create.pug', result.data);
};

module.exports.sua = async (req, res) => {
  try {
    const result = await vouchersService.getSuaData(req.params.id);
    if (!result.ok) {
      req.flash?.('error', 'Không tìm thấy voucher');
      return redirectBackOrDefault(req, res, `${adminBase(req)}/vouchers`);
    }

    res.render('admin/pages/vouchers/edit.pug', result.data);
  } catch (error) {
    console.error('Load voucher edit error:', error);
    req.flash?.('error', 'Không thể tải voucher');
    return redirectBackOrDefault(req, res, `${adminBase(req)}/vouchers`);
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await vouchersService.capNhatVoucher({ id: req.params.id, body: req.body || {}, file: req.file || null });
    req.flash(result.ok ? 'success' : 'error', result.message);
    if (!result.ok) {
      return redirectBackOrDefault(req, res, `${adminBase(req)}/vouchers/${req.params.id}/edit`);
    }
    return redirectBackOrDefault(req, res, `${adminBase(req)}/vouchers`);
  } catch (error) {
    console.error('Update voucher error:', error);
    req.flash('error', `Không thể cập nhật voucher: ${error.message}`);
    return redirectBackOrDefault(req, res, `${adminBase(req)}/vouchers`);
  }
};

module.exports.taoMoiPost = async (req, res) => {
  try {
    const result = await vouchersService.taoMoiVoucher({ body: req.body || {}, file: req.file || null });
    req.flash(result.ok ? 'success' : 'error', result.message);
    if (!result.ok) return redirectBack(req, res);
    return res.redirect(`${adminBase(req)}/vouchers`);
  } catch (error) {
    console.error('Create voucher error:', error);
    req.flash('error', `Không thể tạo voucher: ${error.message}`);
    return redirectBack(req, res);
  }
};
