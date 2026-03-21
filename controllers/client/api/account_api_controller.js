const {
  getProfilePageData,
  updateUserProfile,
  changeUserPassword,
  softDeleteUserAccount
} = require('../../../services/account/index.js');

module.exports.thongTin = async (req, res) => {
  try {
    const data = await getProfilePageData({ userId: req.user?._id, fallbackUser: req.user });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('account api profile error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tải thông tin tài khoản' });
  }
};

module.exports.capNhatHoSo = async (req, res) => {
  try {
    await updateUserProfile({
      userId: req.user?._id,
      payload: req.body,
      fileUpload: req.file,
      currentAvatar: req.user?.avatar
    });

    return res.json({ success: true, message: 'Cập nhật thông tin thành công' });
  } catch (error) {
    console.error('account api update profile error:', error);
    if (error?.code === 'AUTH_REQUIRED') {
      return res.status(401).json({ success: false, message: error.message || 'Vui lòng đăng nhập lại', redirect: '/auth?mode=login' });
    }
    return res.status(400).json({ success: false, message: error?.message || 'Không thể cập nhật thông tin' });
  }
};

module.exports.doiMatKhau = async (req, res) => {
  try {
    await changeUserPassword({
      userId: req.user?._id,
      oldPassword: req.body.oldPassword,
      newPassword: req.body.newPassword,
      confirmPassword: req.body.confirmPassword
    });

    return res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('account api change password error:', error);
    if (error?.code === 'AUTH_REQUIRED' || error?.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(401).json({ success: false, message: error?.message || 'Vui lòng đăng nhập lại', redirect: '/auth?mode=login' });
    }
    return res.status(400).json({ success: false, message: error?.message || 'Không thể đổi mật khẩu' });
  }
};

module.exports.xoaTaiKhoan = async (req, res) => {
  try {
    await softDeleteUserAccount({ userId: req.user?._id });

    try {
      req.logout(() => {});
    } catch {}

    return res.json({ success: true, message: 'Đã xóa tài khoản', redirect: '/' });
  } catch (error) {
    console.error('account api delete error:', error);
    if (error?.code === 'AUTH_REQUIRED') {
      return res.status(401).json({ success: false, message: error?.message || 'Vui lòng đăng nhập lại', redirect: '/auth?mode=login' });
    }
    return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản' });
  }
};
