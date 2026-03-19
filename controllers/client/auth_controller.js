const passport = require('passport');
const { redirectAfterLogin } = require('../../middlewares/auth');
const clientAuthService = require('../../services/auth/client-auth.service.js');

// Trang
module.exports.trang = async (req, res) => {
  if (clientAuthService.laTaiKhoanDangNhapHoatDong(req.user)) {
    return redirectAfterLogin(req.user, res);
  }

  const data = clientAuthService.taoDuLieuTrangDangNhap(req);
  return res.render('client/pages/auth/index.pug', data);
};

// Đăng ký
module.exports.dangKy = async (req, res) => {
  try {
    const result = await clientAuthService.xuLyDangKy(req);
    req.flash(result.flashType, result.message);
    return res.redirect(result.redirect);
  } catch (loi) {
    console.error('Register error:', loi);
    req.flash('error', 'Có lỗi khi đăng ký');
    return res.redirect('/auth?mode=register');
  }
};

// Đăng nhập 
module.exports.dangNhap = async (req, res) => {
  try {
    const result = await clientAuthService.xuLyDangNhap(req);
    if (!result.ok) {
      req.flash('error', result.message || 'Có lỗi khi đăng nhập');
      return res.redirect(result.redirect || '/auth?mode=login');
    }

    if (result.rememberEmail) {
      res.cookie('rememberEmail', result.rememberEmail, {
        ...clientAuthService.tuyChonCookie(),
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
    } else {
      res.clearCookie('rememberEmail', clientAuthService.tuyChonCookie());
    }

    return redirectAfterLogin(result.user, res);
  } catch (loi) {
    console.error('Login error:', loi);
    req.flash('error', 'Có lỗi khi đăng nhập');
    return res.redirect('/auth?mode=login');
  }
};

// Đăng xuất
module.exports.dangXuat = async (req, res) => {
  await clientAuthService.xuLyDangXuat(req);

  req.logout(function () {
    // Không xóa toàn bộ phiên làm việc để các ngữ cảnh đăng nhập khác (ví dụ: admin) có thể vẫn hoạt động.
    res.redirect('/');
  });
};

// Google
module.exports.batDauGoogle = (req, res, next) => {
  const validation = clientAuthService.kiemTraGoogleAuth();
  if (!validation.ok) {
    req.flash('error', 'Chưa cấu hình đúng Google Login (kiểm tra GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    return res.redirect(validation.redirect);
  }
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

// Google callback
module.exports.xuLyGoogleCallback = (req, res, next) => {
  const validation = clientAuthService.kiemTraGoogleAuth();
  if (!validation.ok) {
    req.flash('error', 'Chưa cấu hình đúng Google Login (kiểm tra GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    return res.redirect(validation.redirect);
  }

  const queryError = clientAuthService.xuLyLoiGoogleQuery(req);
  if (queryError && queryError.shouldStop) {
    clientAuthService.writeLoginLog({ req, ...queryError.log });
    req.flash('error', queryError.message || 'Đăng nhập Google thất bại');
    return res.redirect(queryError.redirect);
  }

  passport.authenticate('google', function (loi, taikhoan) {
    if (loi) {
      console.error('Google callback error:', loi);
      const goiy = clientAuthService.layGoiYLoiGoogle(loi, req);
      clientAuthService.writeLoginLog({ req, provider: 'google', status: 'failed', message: goiy || 'passport_error' });
      req.flash('error', goiy || 'Đăng nhập Google thất bại');
      return res.redirect('/auth?mode=login');
    }

    clientAuthService.xuLyGoogleDaXacThuc(req, taikhoan)
      .then((user) => {
        clientAuthService.writeLoginLog({ req, user, provider: 'google', status: 'success' });
        redirectAfterLogin(user, res);
      })
      .catch((error) => {
        if (String(error?.message || '').includes('req_login_failed')) {
          clientAuthService.writeLoginLog({ req, user: taikhoan, provider: 'google', status: 'failed', message: 'req_login_failed' });
        }
        req.flash('error', error?.message || 'Đăng nhập Google thất bại');
        return res.redirect('/auth?mode=login');
      });
  })(req, res, next);
};

module.exports.trangQuenMatKhau = (req, res) => {
  const data = clientAuthService.getTrangQuenMatKhauData(req);
  return res.render('client/pages/auth/forgot_password.pug', {
    ...data
  });
};

module.exports.guiEmailDatLaiMatKhau = async (req, res) => {
  try {
    const result = await clientAuthService.xuLyGuiEmailDatLai(req);
    if (result.ok) {
      const { normalizedEmail, mailInfo } = result;
    console.log('FORGOT_PASSWORD_MAIL_SENT', {
      toEmail: normalizedEmail,
      messageId: mailInfo && mailInfo.messageId ? mailInfo.messageId : null,
      accepted: mailInfo && mailInfo.accepted ? mailInfo.accepted : null,
      rejected: mailInfo && mailInfo.rejected ? mailInfo.rejected : null
    });
    }

    req.flash(result.flashType, result.message || 'Không thể gửi email đặt lại mật khẩu lúc này');
    return res.redirect(result.redirect);
  } catch (error) {
    console.error('forgotPassword error:', error);

    req.flash('error', 'Không thể gửi email đặt lại mật khẩu lúc này');
    return res.redirect('/forgot-password');
  }
};

module.exports.trangDatLaiMatKhau = async (req, res) => {
  const result = await clientAuthService.xuLyTrangDatLai(req);
  if (!result.ok) {
    req.flash(result.flashType || 'error', result.message || 'Liên kết đã hết hạn hoặc không hợp lệ');
    return res.redirect(result.redirect || '/forgot-password');
  }

  return res.render('client/pages/auth/reset_password.pug', result.data);
};

module.exports.datLaiMatKhau = async (req, res) => {
  try {
    const result = await clientAuthService.xuLyDatLaiMatKhau(req);
    req.flash(result.flashType || (result.ok ? 'success' : 'error'), result.message || 'Không thể đặt lại mật khẩu');
    return res.redirect(result.redirect);
  } catch (error) {
    console.error('resetPassword error:', error);

    req.flash('error', 'Không thể đặt lại mật khẩu');
    return res.redirect('/forgot-password');
  }
};
