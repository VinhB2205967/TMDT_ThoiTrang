const bcrypt = require('bcryptjs');
const nguoidung = require('../../models/user_model');
const systemConfig = require('../../config/system');
const { writeLoginLog } = require('../../services/loginLog');
const { verifyPasswordWithLegacy, getAccountByUserId } = require('../../services/account/index.js');
// Chuẩn hóa email
function chuanHoaEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Đăng nhập
module.exports.trangDangNhap = (req, res) => {
  // nếu đăng nhập => admin
  if (req.session?.adminUserId) return res.redirect(systemConfig.prefigAdmin);

  res.render('admin/pages/auth/login.pug', {
    titlePage: 'Đăng nhập Admin'
  });
};

// Đăng nhập
module.exports.dangNhap = async (req, res) => {
  try {
    const emaildangnhap = chuanHoaEmail(req.body.email);
    const matkhau = String(req.body.password || '');

    if (!emaildangnhap || !matkhau) {
      await writeLoginLog({ req, email: emaildangnhap, provider: 'admin', status: 'failed', message: 'missing_credentials' });
      req.flash('error', 'Vui lòng nhập email và mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    const taikhoan = await nguoidung.findOne({ email: emaildangnhap, daxoa: { $ne: true } });
    if (!taikhoan) {
      await writeLoginLog({ req, email: emaildangnhap, provider: 'admin', status: 'failed', message: 'user_not_found' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    const hople = await verifyPasswordWithLegacy({ userDoc: taikhoan, passwordPlain: matkhau });
    if (!hople) {
      await writeLoginLog({ req, user: taikhoan, provider: 'admin', status: 'failed', message: 'wrong_password' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    const acc = await getAccountByUserId({ userId: taikhoan._id }).catch(() => null);
    if (!acc || acc.trangthai !== 'active') {
      await writeLoginLog({ req, user: taikhoan, provider: 'admin', status: 'failed', message: 'noactive' });
      req.flash('error', 'Tài khoản đang bị khóa');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }
    if (acc.vaitro !== 'admin') {
      await writeLoginLog({ req, user: taikhoan, provider: 'admin', status: 'failed', message: 'not_admin' });
      req.flash('error', 'Tài khoản này không có quyền Admin');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }
// cập nhật thông tin
    await nguoidung.updateOne(
      { _id: taikhoan._id },
      {
        $set: {
          lastLoginAt: new Date(),
          lastLoginProvider: 'admin',
          lastLoginIp: req.ip,
          lastLoginUserAgent: String(req.headers['user-agent'] || ''),
          lastSeenAt: new Date()
        }
      }
    );
// lưu session
    req.session.adminUserId = String(taikhoan._id);
    await writeLoginLog({ req, user: taikhoan, provider: 'admin', status: 'success' });
    req.flash('success', 'Đăng nhập Admin thành công');
    return res.redirect(systemConfig.prefigAdmin);
  } catch (err) {
    console.error('Admin login error:', err);
    await writeLoginLog({ req, email: chuanHoaEmail(req.body.email), provider: 'admin', status: 'failed', message: 'exception' });
    req.flash('error', 'Có lỗi khi đăng nhập Admin');
    return res.redirect(`${systemConfig.prefigAdmin}/login`);
  }
};

// Đăng xuất
module.exports.dangXuat = (req, res) => {
  const idadmin = req.session && req.session.adminUserId;

 // cập nhật trạng thái offline
  if (idadmin) {
    const onlinewindowms = 5 * 60 * 1000;
    const thoidiemoffline = new Date(Date.now() - onlinewindowms - 1000);
    nguoidung.updateOne(
      { _id: idadmin, daxoa: { $ne: true } },
      { $set: { lastSeenAt: thoidiemoffline } }
    ).catch(() => {});
  }

  if (req.session) delete req.session.adminUserId;
  return res.redirect(`${systemConfig.prefigAdmin}/login`);
};
