const passport = require('passport');
const { redirectAfterLogin } = require('../../../middlewares/auth');
const clientAuthService = require('../../../services/auth/client-auth.service.js');

module.exports.trangThai = async (req, res) => {
  if (clientAuthService.laTaiKhoanDangNhapHoatDong(req.user)) {
    return res.json({ success: true, authenticated: true, user: req.user });
  }

  return res.json({ success: true, authenticated: false });
};

module.exports.dangKy = async (req, res) => {
  try {
    const result = await clientAuthService.xuLyDangKy(req);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message, redirect: result.redirect });
    }

    return res.status(201).json({ success: true, message: result.message, redirect: result.redirect });
  } catch (error) {
    console.error('auth api register error:', error);
    return res.status(500).json({ success: false, message: 'Có lỗi khi đăng ký' });
  }
};

module.exports.dangNhap = async (req, res) => {
  try {
    const result = await clientAuthService.xuLyDangNhap(req);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message || 'Có lỗi khi đăng nhập', redirect: result.redirect || '/auth?mode=login' });
    }

    if (result.rememberEmail) {
      res.cookie('rememberEmail', result.rememberEmail, {
        ...clientAuthService.tuyChonCookie(),
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
    } else {
      res.clearCookie('rememberEmail', clientAuthService.tuyChonCookie());
    }

    let redirect = '/';
    const redirectRes = {
      redirect: (url) => {
        redirect = url;
      }
    };
    redirectAfterLogin(result.user, redirectRes);

    return res.json({ success: true, redirect, user: result.user });
  } catch (error) {
    console.error('auth api login error:', error);
    return res.status(500).json({ success: false, message: 'Có lỗi khi đăng nhập' });
  }
};

module.exports.dangXuat = async (req, res) => {
  await clientAuthService.xuLyDangXuat(req);
  req.logout(() => {
    return res.json({ success: true, redirect: '/' });
  });
};

module.exports.guiEmailDatLaiMatKhau = async (req, res) => {
  try {
    const result = await clientAuthService.xuLyGuiEmailDatLai(req);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message || 'Không thể gửi email đặt lại mật khẩu', redirect: result.redirect });
    }

    return res.json({ success: true, message: result.message, redirect: result.redirect });
  } catch (error) {
    console.error('auth api forgot-password error:', error);
    return res.status(500).json({ success: false, message: 'Không thể gửi email đặt lại mật khẩu lúc này' });
  }
};

module.exports.datLaiMatKhau = async (req, res) => {
  try {
    const result = await clientAuthService.xuLyDatLaiMatKhau(req);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message || 'Không thể đặt lại mật khẩu', redirect: result.redirect });
    }

    return res.json({ success: true, message: result.message, redirect: result.redirect });
  } catch (error) {
    console.error('auth api reset-password error:', error);
    return res.status(500).json({ success: false, message: 'Không thể đặt lại mật khẩu' });
  }
};

module.exports.batDauGoogle = (req, res, next) => {
  const validation = clientAuthService.kiemTraGoogleAuth();
  if (!validation.ok) {
    return res.status(400).json({ success: false, message: validation.message, redirect: validation.redirect });
  }
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};
