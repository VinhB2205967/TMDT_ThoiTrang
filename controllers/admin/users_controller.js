const adminUsersService = require('../../services/account/admin-users.service');

function usersHome() {
  return adminUsersService.layDuongDanDanhSachMacDinh();
}

function flashByResult(req, result) {
  req.flash(adminUsersService.xacDinhLoaiFlashKetQua(result), result.message);
}

async function xuLyAction(req, res, action, logLabel, errorMessage) {
  try {
    const result = await action();
    flashByResult(req, result);
    return res.redirect(result.redirect || usersHome());
  } catch (err) {
    console.error(logLabel, err);
    req.flash('error', errorMessage);
    return res.redirect(usersHome());
  }
}

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
    return res.redirect(usersHome());
  }
};

module.exports.capNhatVaiTro = async (req, res) => {
  return xuLyAction(
    req,
    res,
    () => adminUsersService.capNhatVaiTro(req.params.id, req.body.vaitro),
    'admin users updateRole error:',
    'Không thể cập nhật vai trò'
  );
};

module.exports.capNhatTrangThai = async (req, res) => {
  return xuLyAction(
    req,
    res,
    () => adminUsersService.capNhatTrangThai(req.params.id, req.body.trangthai),
    'admin users updateStatus error:',
    'Không thể cập nhật trạng thái'
  );
};

module.exports.xoaMem = async (req, res) => {
  return xuLyAction(
    req,
    res,
    () => adminUsersService.xoaMem(req.params.id),
    'admin users softDelete error:',
    'Không thể xóa tài khoản'
  );
};

module.exports.capNhatTuChiTiet = async (req, res) => {
  const currentAdminId = req.session && req.session.adminUserId
    ? String(req.session.adminUserId)
    : (req.adminUser && req.adminUser._id ? String(req.adminUser._id) : '');

  return xuLyAction(
    req,
    res,
    () => adminUsersService.capNhatTuChiTiet({
      userId: req.params.id,
      currentAdminId,
      body: req.body,
      filesUpload: req.files
    }),
    'admin users updateFromDetail error:',
    'Không thể cập nhật tài khoản'
  );
};

module.exports.datMatKhauTuChiTiet = async (req, res) => {
  return xuLyAction(
    req,
    res,
    () => adminUsersService.datMatKhauTuChiTiet({
      userId: req.params.id,
      newPassword: req.body.newPassword,
      confirmPassword: req.body.confirmPassword,
      referer: req.get('referer')
    }),
    'admin users setPasswordFromDetail error:',
    'Không thể đặt lại mật khẩu'
  );
};

module.exports.khoiPhucTuChiTiet = async (req, res) => {
  return xuLyAction(
    req,
    res,
    () => adminUsersService.khoiPhucTuChiTiet(req.params.id, req.get('referer')),
    'admin users restoreFromDetail error:',
    'Không thể khôi phục tài khoản'
  );
};

module.exports.xoaVinhVien = async (req, res) => {
  return xuLyAction(
    req,
    res,
    () => adminUsersService.xoaVinhVien(req.params.id, req.get('referer')),
    'admin users hardDelete error:',
    'Không thể xóa vĩnh viễn tài khoản'
  );
};
