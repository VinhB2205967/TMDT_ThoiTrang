const bcrypt = require('bcryptjs');
const passport = require('passport');
const Nguoidung = require('../../models/user_model');
const { redirectAfterLogin } = require('../../middlewares/auth');
const { writeLoginLog } = require('../../services/loginLog');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePassword(password) {
  const p = String(password || '');
  if (p.length < 6) return 'Mật khẩu phải tối thiểu 6 ký tự';
  return null;
}

function isGoogleEnabled() {
  const id = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const secret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!id || !secret) return false;
  // Common placeholder values
  if (secret === 'NEW_SECRET_HERE' || secret === 'YOUR_GOOGLE_CLIENT_SECRET') return false;
  return true;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };
}

// GET /auth (also used by /login, /register)
module.exports.page = async (req, res) => {
  const mode = req.query.mode === 'register' ? 'register' : 'login';
  const rememberedEmail = String(req.cookies?.rememberEmail || '').trim();
  res.render('client/pages/auth/index.pug', {
    titlePage: mode === 'register' ? 'Đăng ký' : 'Đăng nhập',
    mode,
    googleEnabled: isGoogleEnabled(),
    rememberedEmail
  });
};

// POST /auth/register
module.exports.register = async (req, res) => {
  try {
    const hoten = String(req.body.hoten || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email) {
      req.flash('error', 'Email không hợp lệ');
      return res.redirect('/auth?mode=register');
    }

    const pwError = validatePassword(password);
    if (pwError) {
      req.flash('error', pwError);
      return res.redirect('/auth?mode=register');
    }

    const existing = await Nguoidung.findOne({ email, daxoa: { $ne: true } });
    if (existing) {
      req.flash('error', 'Email đã tồn tại');
      return res.redirect('/auth?mode=register');
    }

    const matkhau = await bcrypt.hash(password, 10);

    const user = await Nguoidung.create({
      hoten: hoten || email.split('@')[0],
      email,
      matkhau,
      vaitro: 'user',
      trangthai: 'active',
      xacthuc: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    req.login(user, function (err) {
      if (err) {
        req.flash('error', 'Đăng nhập sau đăng ký thất bại');
        return res.redirect('/auth?mode=login');
      }
      redirectAfterLogin(user, res);
    });
  } catch (err) {
    console.error('Register error:', err);
    req.flash('error', 'Có lỗi khi đăng ký');
    return res.redirect('/auth?mode=register');
  }
};

// POST /auth/login
module.exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const remember = req.body.remember === 'on' || req.body.remember === '1' || req.body.remember === true;

    const user = await Nguoidung.findOne({ email, daxoa: { $ne: true } });
    if (!user) {
      await writeLoginLog({ req, email, provider: 'local', status: 'failed', message: 'user_not_found' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect('/auth?mode=login');
    }

    if (user.trangthai !== 'active') {
      await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'noactive' });
      req.flash('error', 'Tài khoản đang bị khóa');
      return res.redirect('/auth?mode=login');
    }

    const ok = await bcrypt.compare(password, user.matkhau || '');
    if (!ok) {
      await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'wrong_password' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect('/auth?mode=login');
    }

    // Update last login audit fields
    await Nguoidung.updateOne(
      { _id: user._id },
      {
        $set: {
          lastLoginAt: new Date(),
          lastLoginProvider: 'local',
          lastLoginIp: req.ip,
          lastLoginUserAgent: String(req.headers['user-agent'] || ''),
          lastSeenAt: new Date()
        }
      }
    );

    req.login(user, function (err) {
      if (err) {
        writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'req_login_failed' });
        req.flash('error', 'Đăng nhập thất bại');
        return res.redirect('/auth?mode=login');
      }

      writeLoginLog({ req, user, provider: 'local', status: 'success' });

      if (remember) {
        res.cookie('rememberEmail', email, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });
      } else {
        res.clearCookie('rememberEmail', cookieOptions());
      }

      redirectAfterLogin(user, res);
    });
  } catch (err) {
    console.error('Login error:', err);
    await writeLoginLog({ req, email: normalizeEmail(req.body.email), provider: 'local', status: 'failed', message: 'exception' });
    req.flash('error', 'Có lỗi khi đăng nhập');
    return res.redirect('/auth?mode=login');
  }
};

// POST /auth/logout
module.exports.logout = async (req, res) => {
  const userId = req.user && req.user._id ? String(req.user._id) : null;

  // Mark offline immediately (admin users list updates in realtime)
  if (userId) {
    const ONLINE_WINDOW_MS = 5 * 60 * 1000;
    const offlineAt = new Date(Date.now() - ONLINE_WINDOW_MS - 1000);
    Nguoidung.updateOne(
      { _id: userId, daxoa: { $ne: true } },
      { $set: { lastSeenAt: offlineAt } }
    ).catch(() => {});
  }

  req.logout(function () {
    // Do not destroy the whole session so other login contexts (e.g. admin) can remain.
    res.redirect('/');
  });
};

function getGoogleAuthHint(err, req) {
  const queryError = String(req?.query?.error || '').trim();
  if (queryError) {
    if (queryError === 'access_denied') return 'Bạn đã hủy/không cấp quyền cho Google.';
    return `Google trả về lỗi: ${queryError}`;
  }

  const raw = String(err?.message || err || '').toLowerCase();
  const oauthData = String(err?.oauthError?.data || '').toLowerCase();
  const combined = `${raw} ${oauthData}`;

  if (combined.includes('redirect_uri_mismatch')) {
    return 'Sai Redirect URI. Hãy thêm đúng URL callback vào Google Console (Authorized redirect URIs).';
  }
  if (combined.includes('invalid_client') || combined.includes('unauthorized_client')) {
    return 'Sai GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET hoặc OAuth Client chưa đúng loại (Web application).';
  }
  if (combined.includes('invalid_grant')) {
    return 'Phiên đăng nhập Google hết hạn, thử lại.';
  }

  return '';
}

// GET /auth/google
module.exports.googleStart = (req, res, next) => {
  if (!isGoogleEnabled()) {
    req.flash('error', 'Chưa cấu hình đúng Google Login (kiểm tra GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    return res.redirect('/auth?mode=login');
  }
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

// GET /auth/google/callback
module.exports.googleCallback = (req, res, next) => {
  if (!isGoogleEnabled()) {
    req.flash('error', 'Chưa cấu hình đúng Google Login (kiểm tra GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    return res.redirect('/auth?mode=login');
  }

  if (req.query && req.query.error) {
    const hint = getGoogleAuthHint(null, req);
    writeLoginLog({ req, provider: 'google', status: 'failed', message: hint || String(req.query.error || '') });
    req.flash('error', hint || 'Đăng nhập Google thất bại');
    return res.redirect('/auth?mode=login');
  }

  passport.authenticate('google', function (err, user) {
    if (err) {
      console.error('Google callback error:', err);
      const hint = getGoogleAuthHint(err, req);
      writeLoginLog({ req, provider: 'google', status: 'failed', message: hint || 'passport_error' });
      req.flash('error', hint || 'Đăng nhập Google thất bại');
      return res.redirect('/auth?mode=login');
    }

    if (!user) {
      writeLoginLog({ req, provider: 'google', status: 'failed', message: 'no_user' });
      req.flash('error', 'Không thể lấy thông tin Google');
      return res.redirect('/auth?mode=login');
    }

    Nguoidung.updateOne(
      { _id: user._id },
      {
        $set: {
          lastLoginAt: new Date(),
          lastLoginProvider: 'google',
          lastLoginIp: req.ip,
          lastLoginUserAgent: String(req.headers['user-agent'] || ''),
          lastSeenAt: new Date()
        }
      }
    ).catch(() => {});

    req.login(user, function (loginErr) {
      if (loginErr) {
        writeLoginLog({ req, user, provider: 'google', status: 'failed', message: 'req_login_failed' });
        req.flash('error', 'Đăng nhập Google thất bại');
        return res.redirect('/auth?mode=login');
      }

      writeLoginLog({ req, user, provider: 'google', status: 'success' });
      redirectAfterLogin(user, res);
    });
  })(req, res, next);
};
