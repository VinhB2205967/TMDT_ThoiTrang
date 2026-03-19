const adminUsersService = require('../../services/account/admin-users.service');

module.exports.danhSach = async (req, res) => {
  try {
    const data = await adminUsersService.getDanhSachData(req.query);
    return res.render('admin/pages/users/index.pug', data);
  } catch (err) {
    console.error('admin users index error:', err);
    req.flash('error', 'Không thể tải danh sách người dùng');
    return res.render('admin/pages/users/index.pug', adminUsersService.getDanhSachFallbackData());
  }
};

module.exports.chiTiet = async (req, res) => {
  try {
    const result = await adminUsersService.getChiTietData(req.params.id);
    if (!result.ok) {
      req.flash('error', result.message);
      return res.redirect(result.redirect);
    }
    return res.render('admin/pages/users/detail.pug', result.data);
  } catch (err) {
    console.error('admin users detail error:', err);
    req.flash('error', 'Không thể tải chi tiết tài khoản');
    return res.redirect('/admin/users');
  }
};

module.exports.anhChupOnline = async (req, res) => {
  try {
    const data = await adminUsersService.getAnhChupOnlineData(req.query);
    return res.json(data);
  } catch (err) {
    console.error('admin users onlineSnapshot error:', err);
    return res.status(500).json({ now: new Date().toISOString(), users: [] });
  }
};

module.exports.capNhatVaiTro = async (req, res) => {
  try {
    const result = await adminUsersService.capNhatVaiTro(req.params.id, req.body.vaitro);
    req.flash(result.ok ? 'success' : 'error', result.message);
    return res.redirect(result.redirect);
  } catch (err) {
    console.error('admin users updateRole error:', err);
    req.flash('error', 'Không thể cập nhật vai trò');
    return res.redirect('/admin/users');
  }
};

module.exports.capNhatTrangThai = async (req, res) => {
  try {
    const result = await adminUsersService.capNhatTrangThai(req.params.id, req.body.trangthai);
    req.flash(result.ok ? 'success' : 'error', result.message);
    return res.redirect(result.redirect);
  } catch (err) {
    console.error('admin users updateStatus error:', err);
    req.flash('error', 'Không thể cập nhật trạng thái');
    return res.redirect('/admin/users');
  }
};

module.exports.xoaMem = async (req, res) => {
  try {
    const result = await adminUsersService.xoaMem(req.params.id);
    req.flash(result.ok ? 'success' : 'error', result.message);
    return res.redirect(result.redirect);
  } catch (err) {
    console.error('admin users softDelete error:', err);
    req.flash('error', 'Không thể xóa tài khoản');
    return res.redirect('/admin/users');
  }
};

module.exports.capNhatTuChiTiet = async (req, res) => {
  try {
    const result = await adminUsersService.capNhatTuChiTiet({
      userId: req.params.id,
      body: req.body,
      referer: req.get('referer')
    });
    req.flash(result.ok ? 'success' : 'error', result.message);
    return res.redirect(result.redirect);
  } catch (err) {
    console.error('admin users updateFromDetail error:', err);
    req.flash('error', 'Không thể cập nhật tài khoản');
    return res.redirect('/admin/users');
  }
};

module.exports.datMatKhauTuChiTiet = async (req, res) => {
  try {
    const result = await adminUsersService.datMatKhauTuChiTiet({
      userId: req.params.id,
      newPassword: req.body.newPassword,
      confirmPassword: req.body.confirmPassword,
      referer: req.get('referer')
    });
    req.flash(result.ok ? 'success' : 'error', result.message);
    return res.redirect(result.redirect);
  } catch (err) {
    console.error('admin users setPasswordFromDetail error:', err);
    req.flash('error', 'Không thể đặt lại mật khẩu');
    return res.redirect('/admin/users');
  }
};

module.exports.khoiPhucTuChiTiet = async (req, res) => {
  try {
    const result = await adminUsersService.khoiPhucTuChiTiet(req.params.id, req.get('referer'));
    req.flash(result.ok ? 'success' : 'error', result.message);
    return res.redirect(result.redirect);
  } catch (err) {
    console.error('admin users restoreFromDetail error:', err);
    req.flash('error', 'Không thể khôi phục tài khoản');
    return res.redirect('/admin/users');
  }
};

module.exports.xoaVinhVien = async (req, res) => {
  try {
    const result = await adminUsersService.xoaVinhVien(req.params.id, req.get('referer'));
    req.flash(result.ok ? 'success' : 'error', result.message);
    return res.redirect(result.redirect);
  } catch (err) {
    console.error('admin users hardDelete error:', err);
    req.flash('error', 'Không thể xóa vĩnh viễn tài khoản');
    return res.redirect('/admin/users');
  }
};
