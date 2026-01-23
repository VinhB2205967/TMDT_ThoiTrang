const bcrypt = require('bcryptjs');
const passport = require('passport');
const Nguoidung = require('../../models/user_model');
const { redirectAfterLogin } = require('../../middlewares/auth');
const { writeLoginLog } = require('../../services/loginLog');
const { isValidEmail } = require('../../helpers/validators');

function chuanHoaEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function kiemTraMatKhau(password) {
  const matKhau = String(password || '');
  if (matKhau.length < 6) return 'Mật khẩu phải tối thiểu 6 ký tự';
  return null;
}

function kiemTraGoogle() {
  const maClient = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const biMatClient = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!maClient || !biMatClient) return false;
  // Placeholder
  if (biMatClient === 'NEW_SECRET_HERE' || biMatClient === 'YOUR_GOOGLE_CLIENT_SECRET') return false;
  return true;
}

function tuyChonCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };
}

// Trang
module.exports.trang = async (req, res) => {
 // Nếu đã đăng nhập
  if (req.user && req.user.trangthai === 'active') {
    return redirectAfterLogin(req.user, res);
  }

  const cheDo = req.query.mode === 'register' ? 'register' : 'login';
  const emailDaNho = String(req.cookies?.rememberEmail || '').trim();
  res.render('client/pages/auth/index.pug', {
    titlePage: cheDo === 'register' ? 'Đăng ký' : 'Đăng nhập',
    mode: cheDo,
    googleEnabled: kiemTraGoogle(),
    rememberedEmail: emailDaNho
  });
};

// Đăng ký
module.exports.dangKy = async (req, res) => {
  try {
    const hoTen = String(req.body.hoten || '').trim();
    const emailDangKy = chuanHoaEmail(req.body.email);
    const matKhau = String(req.body.password || '');

    if (!emailDangKy || !isValidEmail(emailDangKy)) {
      req.flash('error', 'Email không đúng định dạng');
      return res.redirect('/auth?mode=register');
    }

    const loiMatKhau = kiemTraMatKhau(matKhau);
    if (loiMatKhau) {
      req.flash('error', loiMatKhau);
      return res.redirect('/auth?mode=register');
    }

    const nguoiDungTonTai = await Nguoidung.findOne({ email: emailDangKy, daxoa: { $ne: true } });
    if (nguoiDungTonTai) {
      req.flash('error', 'Email đã tồn tại');
      return res.redirect('/auth?mode=register');
    }

    const matkhau = await bcrypt.hash(matKhau, 10);

    const nguoiDung = await Nguoidung.create({
      hoten: hoTen || emailDangKy.split('@')[0],
      email: emailDangKy,
      matkhau,
      vaitro: 'user',
      trangthai: 'active',
      xacthuc: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    req.login(nguoiDung, function (loi) {
      if (loi) {
        req.flash('error', 'Đăng nhập sau đăng ký thất bại');
        return res.redirect('/auth?mode=login');
      }
      redirectAfterLogin(nguoiDung, res);
    });
  } catch (loi) {
    console.error('Register error:', loi);
    // lỗi trùng lặp
    if (loi && (loi.code === 11000 || String(loi.message || '').includes('E11000'))) {
      req.flash('error', 'Email đã tồn tại');
      return res.redirect('/auth?mode=register');
    }
    req.flash('error', 'Có lỗi khi đăng ký');
    return res.redirect('/auth?mode=register');
  }
};

// Đăng nhập 
module.exports.dangNhap = async (req, res) => {
  try {
    const emailDangNhap = chuanHoaEmail(req.body.email);
    const matKhau = String(req.body.password || '');
    const ghiNho = req.body.remember === 'on' || req.body.remember === '1' || req.body.remember === true;

    const nguoiDung = await Nguoidung.findOne({ email: emailDangNhap, daxoa: { $ne: true } });
    if (!nguoiDung) {
      await writeLoginLog({ req, email: emailDangNhap, provider: 'local', status: 'failed', message: 'user_not_found' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect('/auth?mode=login');
    }

    if (nguoiDung.trangthai !== 'active') {
      await writeLoginLog({ req, user: nguoiDung, provider: 'local', status: 'failed', message: 'noactive' });
      req.flash('error', 'Tài khoản đang bị khóa');
      return res.redirect('/auth?mode=login');
    }

    const hopLe = await bcrypt.compare(matKhau, nguoiDung.matkhau || '');
    if (!hopLe) {
      await writeLoginLog({ req, user: nguoiDung, provider: 'local', status: 'failed', message: 'wrong_password' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect('/auth?mode=login');
    }

    // cập nhật thông tin
    await Nguoidung.updateOne(
      { _id: nguoiDung._id },
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

    req.login(nguoiDung, function (loi) {
      if (loi) {
        writeLoginLog({ req, user: nguoiDung, provider: 'local', status: 'failed', message: 'req_login_failed' });
        req.flash('error', 'Đăng nhập thất bại');
        return res.redirect('/auth?mode=login');
      }

      writeLoginLog({ req, user: nguoiDung, provider: 'local', status: 'success' });

      if (ghiNho) {
        res.cookie('rememberEmail', emailDangNhap, { ...tuyChonCookie(), maxAge: 30 * 24 * 60 * 60 * 1000 });
      } else {
        res.clearCookie('rememberEmail', tuyChonCookie());
      }

      redirectAfterLogin(nguoiDung, res);
    });
  } catch (loi) {
    console.error('Login error:', loi);
    await writeLoginLog({ req, email: chuanHoaEmail(req.body.email), provider: 'local', status: 'failed', message: 'exception' });
    req.flash('error', 'Có lỗi khi đăng nhập');
    return res.redirect('/auth?mode=login');
  }
};

// Đăng xuất
module.exports.dangXuat = async (req, res) => {
  const idNguoiDung = req.user && req.user._id ? String(req.user._id) : null;

  // cập nhật trạng thái offline
  if (idNguoiDung) {
    const ONLINE_WINDOW_MS = 5 * 60 * 1000;
    const thoiDiemOffline = new Date(Date.now() - ONLINE_WINDOW_MS - 1000);
    Nguoidung.updateOne(
      { _id: idNguoiDung, daxoa: { $ne: true } },
      { $set: { lastSeenAt: thoiDiemOffline } }
    ).catch(() => {});
  }

  req.logout(function () {
    // Không xóa toàn bộ phiên làm việc để các ngữ cảnh đăng nhập khác (ví dụ: admin) có thể vẫn hoạt động.
    res.redirect('/');
  });
};

function goiYGoogleAuth(err, req) {
  const loiTruyVan = String(req?.query?.error || '').trim();
  if (loiTruyVan) {
    if (loiTruyVan === 'access_denied') return 'Bạn đã hủy/không cấp quyền cho Google.';
    return `Google trả về lỗi: ${loiTruyVan}`;
  }

  const noiDungLoi = String(err?.message || err || '').toLowerCase();
  const duLieuOauth = String(err?.oauthError?.data || '').toLowerCase();
  const tongHop = `${noiDungLoi} ${duLieuOauth}`;

  if (tongHop.includes('redirect_uri_mismatch')) {
    return 'Sai Redirect URI. Hãy thêm đúng URL callback vào Google Console (Authorized redirect URIs).';
  }
  if (tongHop.includes('invalid_client') || tongHop.includes('unauthorized_client')) {
    return 'Sai GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET hoặc OAuth Client chưa đúng loại (Web application).';
  }
  if (tongHop.includes('invalid_grant')) {
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
    const goiY = goiYGoogleAuth(null, req);
    writeLoginLog({ req, provider: 'google', status: 'failed', message: goiY || String(req.query.error || '') });
    req.flash('error', goiY || 'Đăng nhập Google thất bại');
    return res.redirect('/auth?mode=login');
  }

  passport.authenticate('google', function (loi, nguoiDung) {
    if (loi) {
      console.error('Google callback error:', loi);
      const goiY = goiYGoogleAuth(loi, req);
      writeLoginLog({ req, provider: 'google', status: 'failed', message: goiY || 'passport_error' });
      req.flash('error', goiY || 'Đăng nhập Google thất bại');
      return res.redirect('/auth?mode=login');
    }

    if (!nguoiDung) {
      writeLoginLog({ req, provider: 'google', status: 'failed', message: 'no_user' });
      req.flash('error', 'Không thể lấy thông tin Google');
      return res.redirect('/auth?mode=login');
    }

    if (nguoiDung.trangthai !== 'active') {
      writeLoginLog({ req, user: nguoiDung, provider: 'google', status: 'failed', message: 'noactive' });
      req.flash('error', 'Tài khoản đang bị khóa');
      return res.redirect('/auth?mode=login');
    }

    Nguoidung.updateOne(
      { _id: nguoiDung._id },
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

    req.login(nguoiDung, function (loiDangNhap) {
      if (loiDangNhap) {
        writeLoginLog({ req, user: nguoiDung, provider: 'google', status: 'failed', message: 'req_login_failed' });
        req.flash('error', 'Đăng nhập Google thất bại');
        return res.redirect('/auth?mode=login');
      }

      writeLoginLog({ req, user: nguoiDung, provider: 'google', status: 'success' });
      redirectAfterLogin(nguoiDung, res);
    });
  })(req, res, next);
};
