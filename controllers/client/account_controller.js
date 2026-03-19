const {
  getProfilePageData,
  updateUserProfile,
  changeUserPassword,
  softDeleteUserAccount
} = require('../../services/account/index.js');

// Thông tin
module.exports.trang = async (req, res) => {
  let viewData = {
    profile: {
      hoten: req.user?.hoten || '',
      email: req.user?.email || '',
      sodienthoai: req.user?.sodienthoai || '',
      diachi: req.user?.diachi || '',
      gioitinh: req.user?.gioitinh || '',
      ngaysinh: '',
      avatar: req.user?.avatar || ''
    },
    hasPassword: false,
    canChangePassword: true
  };

  try {
    viewData = await getProfilePageData({ userId: req.user?._id, fallbackUser: req.user });
  } catch (err) {
    console.error('account page data error:', err);
  }

  res.render('client/pages/account/index.pug', {
    titlePage: 'Thông tin tài khoản',
    profile: viewData.profile,
    hasPassword: viewData.hasPassword,
    canChangePassword: viewData.canChangePassword
  });
};

// Cập nhật hồ sơ
module.exports.capNhatHoSo = async (req, res) => {
  try {
    await updateUserProfile({
      userId: req.user?._id,
      payload: req.body,
      fileUpload: req.file,
      currentAvatar: req.user?.avatar
    });

    req.flash?.('success', 'Cập nhật thông tin thành công');
    return res.redirect('/account');
  } catch (err) {
    console.error('updateProfile error:', err);
    if (err?.code === 'AUTH_REQUIRED') return res.redirect('/auth?mode=login');
    req.flash?.('error', err?.message || 'Không thể cập nhật thông tin');
    return res.redirect('/account');
  }
};

// Đổi mật khẩu
module.exports.doiMatKhau = async (req, res) => {
  try {
    await changeUserPassword({
      userId: req.user?._id,
      oldPassword: req.body.oldPassword,
      newPassword: req.body.newPassword,
      confirmPassword: req.body.confirmPassword
    });

    req.flash?.('success', 'Đổi mật khẩu thành công');
    return res.redirect('/account');
  } catch (err) {
    console.error('changePassword error:', err);
    if (err?.code === 'AUTH_REQUIRED' || err?.code === 'ACCOUNT_NOT_FOUND') {
      req.flash?.('error', err?.message || 'Vui lòng đăng nhập lại');
      return res.redirect('/auth?mode=login');
    }

    req.flash?.('error', err?.message || 'Không thể đổi mật khẩu');
    return res.redirect('/account');
  }
};

// Xóa tài khoản
module.exports.xoaTaiKhoan = async (req, res) => {
  try {
    await softDeleteUserAccount({ userId: req.user?._id });

    try {
      req.logout(() => {});
    } catch {}

    req.flash?.('success', 'Đã xóa tài khoản');
    return res.redirect('/');
  } catch (err) {
    console.error('deleteAccount error:', err);
    if (err?.code === 'AUTH_REQUIRED') return res.redirect('/auth?mode=login');
    req.flash?.('error', 'Không thể xóa tài khoản');
    return res.redirect('/account');
  }
};
