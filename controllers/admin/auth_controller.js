const bcrypt = require('bcryptjs');
const Nguoidung = require('../../models/user_model');
const systemConfig = require('../../config/system');
const { writeLoginLog } = require('../../services/loginLog');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// GET /admin/login
module.exports.pageLogin = (req, res) => {
  // If already admin-authenticated, go straight to admin home
  if (req.session?.adminUserId) return res.redirect(systemConfig.prefigAdmin);

  res.render('admin/pages/auth/login.pug', {
    titlePage: 'Đăng nhập Admin'
  });
};

// POST /admin/login
module.exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      await writeLoginLog({ req, email, provider: 'admin', status: 'failed', message: 'missing_credentials' });
      req.flash('error', 'Vui lòng nhập email và mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    const user = await Nguoidung.findOne({ email, daxoa: { $ne: true } });
    if (!user) {
      await writeLoginLog({ req, email, provider: 'admin', status: 'failed', message: 'user_not_found' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    if (user.trangthai !== 'active') {
      await writeLoginLog({ req, user, provider: 'admin', status: 'failed', message: 'noactive' });
      req.flash('error', 'Tài khoản đang bị khóa');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    if (user.vaitro !== 'admin') {
      await writeLoginLog({ req, user, provider: 'admin', status: 'failed', message: 'not_admin' });
      req.flash('error', 'Tài khoản này không có quyền Admin');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    const ok = await bcrypt.compare(password, user.matkhau || '');
    if (!ok) {
      await writeLoginLog({ req, user, provider: 'admin', status: 'failed', message: 'wrong_password' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    await Nguoidung.updateOne(
      { _id: user._id },
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

    req.session.adminUserId = String(user._id);
    await writeLoginLog({ req, user, provider: 'admin', status: 'success' });
    req.flash('success', 'Đăng nhập Admin thành công');
    return res.redirect(systemConfig.prefigAdmin);
  } catch (err) {
    console.error('Admin login error:', err);
    await writeLoginLog({ req, email: normalizeEmail(req.body.email), provider: 'admin', status: 'failed', message: 'exception' });
    req.flash('error', 'Có lỗi khi đăng nhập Admin');
    return res.redirect(`${systemConfig.prefigAdmin}/login`);
  }
};

// POST /admin/logout
module.exports.logout = (req, res) => {
  const adminUserId = req.session && req.session.adminUserId;

  // Mark offline immediately (so realtime /admin/users polling updates right away)
  if (adminUserId) {
    const ONLINE_WINDOW_MS = 5 * 60 * 1000;
    const offlineAt = new Date(Date.now() - ONLINE_WINDOW_MS - 1000);
    Nguoidung.updateOne(
      { _id: adminUserId, daxoa: { $ne: true } },
      { $set: { lastSeenAt: offlineAt } }
    ).catch(() => {});
  }

  if (req.session) delete req.session.adminUserId;
  return res.redirect(`${systemConfig.prefigAdmin}/login`);
};
