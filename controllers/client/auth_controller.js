const passport = require('passport');
const nguoidung = require('../../models/user_model');
const { redirectAfterLogin } = require('../../middlewares/auth');
const { writeLoginLog } = require('../../services/loginLog');
const { laEmailHopLe } = require('../../helpers/validators');
const {
  createLocalAccountForUser,
  verifyPasswordWithLegacy,
  getAccountByUserId,
  ensureAccountFromUser,
  createPasswordResetToken,
  findAccountByResetToken,
  clearPasswordResetTokenByUserId,
  setPasswordByUserId
} = require('../../services/account.service');
const { sendResetPasswordEmail } = require('../../services/mailer.service');

function chuanHoaEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function kiemTraMatKhau(password) {
  const matkhau = String(password || '');
  if (matkhau.length < 6) return 'Mật khẩu phải tối thiểu 6 ký tự';
  return null;
}

function kiemTraGoogle() {
  const maclient = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const bimatclient = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!maclient || !bimatclient) return false;
  // Placeholder
  if (bimatclient === 'NEW_SECRET_HERE' || bimatclient === 'YOUR_GOOGLE_CLIENT_SECRET') return false;
  return true;
}

function tuyChonCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };
}

function getAppBaseUrl(req) {
  const envBaseUrl = String(process.env.APP_BASE_URL || '').trim();
  if (envBaseUrl) return envBaseUrl.replace(/\/$/, '');
  const proto = req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}`;
}

function luuDuLieuForm(req, data = {}) {
  if (!req || !req.flash) return;
  req.flash('formData', JSON.stringify(data || {}));
}

function layDuLieuForm(req) {
  try {
    const raw = req && req.flash ? req.flash('formData') : [];
    const first = Array.isArray(raw) ? raw[0] : null;
    if (!first) return {};
    const parsed = JSON.parse(first);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Trang
module.exports.trang = async (req, res) => {
 // Nếu đã đăng nhập
  if (req.user && req.user.trangthai === 'active') {
    return redirectAfterLogin(req.user, res);
  }

  const chedo = req.query.mode === 'register' ? 'register' : 'login';
  const emaildanho = String(req.cookies?.rememberEmail || '').trim();
  const formData = layDuLieuForm(req);
  res.render('client/pages/auth/index.pug', {
    titlePage: chedo === 'register' ? 'Đăng ký' : 'Đăng nhập',
    mode: chedo,
    googleEnabled: kiemTraGoogle(),
    rememberedEmail: emaildanho,
    formData
  });
};

// Đăng ký
module.exports.dangKy = async (req, res) => {
  try {
    const hoten = String(req.body.hoten || '').trim();
    const emaildangky = chuanHoaEmail(req.body.email);
    const matkhau = String(req.body.password || '');

    if (!emaildangky || !laEmailHopLe(emaildangky)) {
      luuDuLieuForm(req, { hoten, email: emaildangky });
      req.flash('error', 'Email không đúng định dạng');
      return res.redirect('/auth?mode=register');
    }

    const loimatkhau = kiemTraMatKhau(matkhau);
    if (loimatkhau) {
      luuDuLieuForm(req, { hoten, email: emaildangky });
      req.flash('error', loimatkhau);
      return res.redirect('/auth?mode=register');
    }

    const nguoidungtontai = await nguoidung.findOne({ email: emaildangky, daxoa: { $ne: true } });
    if (nguoidungtontai) {
      luuDuLieuForm(req, { hoten, email: emaildangky });
      req.flash('error', 'Email đã tồn tại');
      return res.redirect('/auth?mode=register');
    }

    const taikhoan = await nguoidung.create({
      hoten: hoten || emaildangky.split('@')[0],
      email: emaildangky,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    await createLocalAccountForUser({
      userDoc: taikhoan,
      passwordPlain: matkhau,
      overrides: { vaitro: 'user', trangthai: 'active', xacthuc: false }
    });

    req.login(taikhoan, function (loi) {
      if (loi) {
        req.flash('error', 'Đăng nhập sau đăng ký thất bại');
        return res.redirect('/auth?mode=login');
      }
      redirectAfterLogin(taikhoan, res);
    });
  } catch (loi) {
    console.error('Register error:', loi);
    // lỗi trùng lặp
    if (loi && (loi.code === 11000 || String(loi.message || '').includes('E11000'))) {
      luuDuLieuForm(req, { hoten: String(req.body.hoten || '').trim(), email: chuanHoaEmail(req.body.email) });
      req.flash('error', 'Email đã tồn tại');
      return res.redirect('/auth?mode=register');
    }
    luuDuLieuForm(req, { hoten: String(req.body.hoten || '').trim(), email: chuanHoaEmail(req.body.email) });
    req.flash('error', 'Có lỗi khi đăng ký');
    return res.redirect('/auth?mode=register');
  }
};

// Đăng nhập 
module.exports.dangNhap = async (req, res) => {
  try {
    const emaildangnhap = chuanHoaEmail(req.body.email);
    const matkhau = String(req.body.password || '');
    const ghinho = req.body.remember === 'on' || req.body.remember === '1' || req.body.remember === true;

    const taikhoan = await nguoidung.findOne({ email: emaildangnhap, daxoa: { $ne: true } });
    if (!taikhoan) {
      await writeLoginLog({ req, email: emaildangnhap, provider: 'local', status: 'failed', message: 'user_not_found' });
      luuDuLieuForm(req, { email: emaildangnhap, remember: req.body.remember });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect('/auth?mode=login');
    }

    const hople = await verifyPasswordWithLegacy({ userDoc: taikhoan, passwordPlain: matkhau });
    if (!hople) {
      await writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'failed', message: 'wrong_password' });
      luuDuLieuForm(req, { email: emaildangnhap, remember: req.body.remember });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect('/auth?mode=login');
    }

    const acc = await getAccountByUserId({ userId: taikhoan._id }).catch(() => null);
    if (!acc || acc.trangthai !== 'active') {
      await writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'failed', message: 'noactive' });
      luuDuLieuForm(req, { email: emaildangnhap, remember: req.body.remember });
      req.flash('error', 'Tài khoản đang bị khóa');
      return res.redirect('/auth?mode=login');
    }

    // cập nhật thông tin
    await nguoidung.updateOne(
      { _id: taikhoan._id },
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

    req.login(taikhoan, function (loi) {
      if (loi) {
        writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'failed', message: 'req_login_failed' });
        luuDuLieuForm(req, { email: emaildangnhap, remember: req.body.remember });
        req.flash('error', 'Đăng nhập thất bại');
        return res.redirect('/auth?mode=login');
      }

      writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'success' });

      if (ghinho) {
        res.cookie('rememberEmail', emaildangnhap, { ...tuyChonCookie(), maxAge: 30 * 24 * 60 * 60 * 1000 });
      } else {
        res.clearCookie('rememberEmail', tuyChonCookie());
      }

      redirectAfterLogin(taikhoan, res);
    });
  } catch (loi) {
    console.error('Login error:', loi);
    await writeLoginLog({ req, email: chuanHoaEmail(req.body.email), provider: 'local', status: 'failed', message: 'exception' });
    luuDuLieuForm(req, { email: chuanHoaEmail(req.body.email), remember: req.body.remember });
    req.flash('error', 'Có lỗi khi đăng nhập');
    return res.redirect('/auth?mode=login');
  }
};

// Đăng xuất
module.exports.dangXuat = async (req, res) => {
  const idnguoidung = req.user && req.user._id ? String(req.user._id) : null;

  // cập nhật trạng thái offline
  if (idnguoidung) {
    const onlinewindowms = 5 * 60 * 1000;
    const thoidiemoffline = new Date(Date.now() - onlinewindowms - 1000);
    nguoidung.updateOne(
      { _id: idnguoidung, daxoa: { $ne: true } },
      { $set: { lastSeenAt: thoidiemoffline } }
    ).catch(() => {});
  }

  req.logout(function () {
    // Không xóa toàn bộ phiên làm việc để các ngữ cảnh đăng nhập khác (ví dụ: admin) có thể vẫn hoạt động.
    res.redirect('/');
  });
};
// Gợi ý lỗi Google Auth
function goiYGoogleAuth(err, req) {
  const loitruyvan = String(req?.query?.error || '').trim();
  if (loitruyvan) {
    if (loitruyvan === 'access_denied') return 'Bạn đã hủy/không cấp quyền cho Google.';
    return `Google trả về lỗi: ${loitruyvan}`;
  }

  const noidungloi = String(err?.message || err || '').toLowerCase();
  const dulieuoauth = String(err?.oauthError?.data || '').toLowerCase();
  const tonghop = `${noidungloi} ${dulieuoauth}`;

  if (tonghop.includes('redirect_uri_mismatch')) {
    return 'Sai Redirect URI. Hãy thêm đúng URL callback vào Google Console (Authorized redirect URIs).';
  }
  if (tonghop.includes('invalid_client') || tonghop.includes('unauthorized_client')) {
    return 'Sai GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET hoặc OAuth Client chưa đúng loại (Web application).';
  }
  if (tonghop.includes('invalid_grant')) {
    return 'Phiên đăng nhập Google hết hạn, thử lại.';
  }

  return '';
}

// Google
module.exports.batDauGoogle = (req, res, next) => {
  if (!kiemTraGoogle()) {
    req.flash('error', 'Chưa cấu hình đúng Google Login (kiểm tra GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    return res.redirect('/auth?mode=login');
  }
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

// Google callback
module.exports.xuLyGoogleCallback = (req, res, next) => {
  if (!kiemTraGoogle()) {
    req.flash('error', 'Chưa cấu hình đúng Google Login (kiểm tra GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    return res.redirect('/auth?mode=login');
  }

  if (req.query && req.query.error) {
    const goiy = goiYGoogleAuth(null, req);
    writeLoginLog({ req, provider: 'google', status: 'failed', message: goiy || String(req.query.error || '') });
    req.flash('error', goiy || 'Đăng nhập Google thất bại');
    return res.redirect('/auth?mode=login');
  }

  passport.authenticate('google', function (loi, taikhoan) {
    if (loi) {
      console.error('Google callback error:', loi);
      const goiy = goiYGoogleAuth(loi, req);
      writeLoginLog({ req, provider: 'google', status: 'failed', message: goiy || 'passport_error' });
      req.flash('error', goiy || 'Đăng nhập Google thất bại');
      return res.redirect('/auth?mode=login');
    }

    if (!taikhoan) {
      writeLoginLog({ req, provider: 'google', status: 'failed', message: 'no_user' });
      req.flash('error', 'Không thể lấy thông tin Google');
      return res.redirect('/auth?mode=login');
    }

    getAccountByUserId({ userId: taikhoan._id })
      .then((acc) => {
        if (!acc || acc.trangthai !== 'active') {
          writeLoginLog({ req, user: taikhoan, provider: 'google', status: 'failed', message: 'noactive' });
          req.flash('error', 'Tài khoản đang bị khóa');
          return res.redirect('/auth?mode=login');
        }

        nguoidung.updateOne(
          { _id: taikhoan._id },
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

        req.login(taikhoan, function (loidangnhap) {
          if (loidangnhap) {
            writeLoginLog({ req, user: taikhoan, provider: 'google', status: 'failed', message: 'req_login_failed' });
            req.flash('error', 'Đăng nhập Google thất bại');
            return res.redirect('/auth?mode=login');
          }

          writeLoginLog({ req, user: taikhoan, provider: 'google', status: 'success' });
          redirectAfterLogin(taikhoan, res);
        });
      })
      .catch(() => {
        req.flash('error', 'Đăng nhập Google thất bại');
        return res.redirect('/auth?mode=login');
      });
  })(req, res, next);
};

module.exports.trangQuenMatKhau = (req, res) => {
  const formData = layDuLieuForm(req);
  return res.render('client/pages/auth/forgot_password.pug', {
    titlePage: 'Quên mật khẩu',
    formData
  });
};

module.exports.guiEmailDatLaiMatKhau = async (req, res) => {
  try {
    const email = chuanHoaEmail(req.body.email);
    if (!email || !laEmailHopLe(email)) {
      luuDuLieuForm(req, { email });
      req.flash('error', 'Email không đúng định dạng');
      return res.redirect('/forgot-password');
    }

    const user = await nguoidung.findOne({ email, daxoa: { $ne: true } }).lean();
    if (!user) {
      req.flash('error', 'Email không tồn tại trong hệ thống');
      return res.redirect('/forgot-password');
    }

    await ensureAccountFromUser(user, { provider: 'local' });
    const tokenInfo = await createPasswordResetToken({ userId: user._id, expiresMinutes: 15 });
    const resetLink = `${getAppBaseUrl(req)}/reset-password?token=${encodeURIComponent(tokenInfo.tokenPlain)}`;

    const mailInfo = await sendResetPasswordEmail({
      toEmail: email,
      userName: user.hoten || email.split('@')[0],
      resetLink,
      minutes: tokenInfo.expiresMinutes
    });
    console.log('FORGOT_PASSWORD_MAIL_SENT', {
      toEmail: email,
      messageId: mailInfo && mailInfo.messageId ? mailInfo.messageId : null,
      accepted: mailInfo && mailInfo.accepted ? mailInfo.accepted : null,
      rejected: mailInfo && mailInfo.rejected ? mailInfo.rejected : null
    });

    req.flash('success', 'Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.');
    return res.redirect('/forgot-password');
  } catch (error) {
    console.error('forgotPassword error:', error);
    req.flash('error', 'Không thể gửi email đặt lại mật khẩu lúc này');
    return res.redirect('/forgot-password');
  }
};

module.exports.trangDatLaiMatKhau = async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    req.flash('error', 'Liên kết đặt lại mật khẩu không hợp lệ');
    return res.redirect('/forgot-password');
  }

  const account = await findAccountByResetToken({ tokenPlain: token });
  if (!account) {
    req.flash('error', 'Liên kết đã hết hạn hoặc không hợp lệ');
    return res.redirect('/forgot-password');
  }

  return res.render('client/pages/auth/reset_password.pug', {
    titlePage: 'Đặt lại mật khẩu',
    token
  });
};

module.exports.datLaiMatKhau = async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!token) {
      req.flash('error', 'Thiếu token đặt lại mật khẩu');
      return res.redirect('/forgot-password');
    }

    const account = await findAccountByResetToken({ tokenPlain: token });
    if (!account) {
      req.flash('error', 'Liên kết đã hết hạn hoặc không hợp lệ');
      return res.redirect('/forgot-password');
    }

    const passwordError = kiemTraMatKhau(newPassword);
    if (passwordError) {
      req.flash('error', passwordError);
      return res.redirect(`/reset-password?token=${encodeURIComponent(token)}`);
    }

    if (newPassword !== confirmPassword) {
      req.flash('error', 'Xác nhận mật khẩu không khớp');
      return res.redirect(`/reset-password?token=${encodeURIComponent(token)}`);
    }

    await setPasswordByUserId({ userId: account.nguoidung_id, newPasswordPlain: newPassword });
    await clearPasswordResetTokenByUserId({ userId: account.nguoidung_id });

    req.flash('success', 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.');
    return res.redirect('/auth?mode=login');
  } catch (error) {
    console.error('resetPassword error:', error);
    req.flash('error', 'Không thể đặt lại mật khẩu');
    return res.redirect('/forgot-password');
  }
};
