const bcrypt = require('bcryptjs');
const Nguoidung = require('../../models/user_model');
const systemConfig = require('../../config/system');
const { writeLoginLog } = require('../../services/loginLog');
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
    const emailDangNhap = chuanHoaEmail(req.body.email);
    const matKhau = String(req.body.password || '');

    if (!emailDangNhap || !matKhau) {
      await writeLoginLog({ req, email: emailDangNhap, provider: 'admin', status: 'failed', message: 'missing_credentials' });
      req.flash('error', 'Vui lòng nhập email và mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    const nguoiDung = await Nguoidung.findOne({ email: emailDangNhap, daxoa: { $ne: true } });
    if (!nguoiDung) {
      await writeLoginLog({ req, email: emailDangNhap, provider: 'admin', status: 'failed', message: 'user_not_found' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    if (nguoiDung.trangthai !== 'active') {
      await writeLoginLog({ req, user: nguoiDung, provider: 'admin', status: 'failed', message: 'noactive' });
      req.flash('error', 'Tài khoản đang bị khóa');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    if (nguoiDung.vaitro !== 'admin') {
      await writeLoginLog({ req, user: nguoiDung, provider: 'admin', status: 'failed', message: 'not_admin' });
      req.flash('error', 'Tài khoản này không có quyền Admin');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    const hopLe = await bcrypt.compare(matKhau, nguoiDung.matkhau || '');
    if (!hopLe) {
      await writeLoginLog({ req, user: nguoiDung, provider: 'admin', status: 'failed', message: 'wrong_password' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }
// cập nhật thông tin
    await Nguoidung.updateOne(
      { _id: nguoiDung._id },
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
    req.session.adminUserId = String(nguoiDung._id);
    await writeLoginLog({ req, user: nguoiDung, provider: 'admin', status: 'success' });
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
  const idAdmin = req.session && req.session.adminUserId;

 // cập nhật trạng thái offline
  if (idAdmin) {
    const ONLINE_WINDOW_MS = 5 * 60 * 1000;
    const thoiDiemOffline = new Date(Date.now() - ONLINE_WINDOW_MS - 1000);
    Nguoidung.updateOne(
      { _id: idAdmin, daxoa: { $ne: true } },
      { $set: { lastSeenAt: thoiDiemOffline } }
    ).catch(() => {});
  }

  if (req.session) delete req.session.adminUserId;
  return res.redirect(`${systemConfig.prefigAdmin}/login`);
};
