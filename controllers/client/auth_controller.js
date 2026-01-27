const bcrypt = require('bcryptjs');
const passport = require('passport');
const nguoidung = require('../../models/user_model');
const { redirectAfterLogin } = require('../../middlewares/auth');
const { writeLoginLog } = require('../../services/loginLog');
const { laEmailHopLe } = require('../../helpers/validators');

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

// Trang
module.exports.trang = async (req, res) => {
 // Nếu đã đăng nhập
  if (req.user && req.user.trangthai === 'active') {
    return redirectAfterLogin(req.user, res);
  }

  const chedo = req.query.mode === 'register' ? 'register' : 'login';
  const emaildanho = String(req.cookies?.rememberEmail || '').trim();
  res.render('client/pages/auth/index.pug', {
    titlePage: chedo === 'register' ? 'Đăng ký' : 'Đăng nhập',
    mode: chedo,
    googleEnabled: kiemTraGoogle(),
    rememberedEmail: emaildanho
  });
};

// Đăng ký
module.exports.dangKy = async (req, res) => {
  try {
    const hoten = String(req.body.hoten || '').trim();
    const emaildangky = chuanHoaEmail(req.body.email);
    const matkhau = String(req.body.password || '');

    if (!emaildangky || !laEmailHopLe(emaildangky)) {
      req.flash('error', 'Email không đúng định dạng');
      return res.redirect('/auth?mode=register');
    }

    const loimatkhau = kiemTraMatKhau(matkhau);
    if (loimatkhau) {
      req.flash('error', loimatkhau);
      return res.redirect('/auth?mode=register');
    }

    const nguoidungtontai = await nguoidung.findOne({ email: emaildangky, daxoa: { $ne: true } });
    if (nguoidungtontai) {
      req.flash('error', 'Email đã tồn tại');
      return res.redirect('/auth?mode=register');
    }

    const matkhaumahoa = await bcrypt.hash(matkhau, 10);

    const taikhoan = await nguoidung.create({
      hoten: hoten || emaildangky.split('@')[0],
      email: emaildangky,
      matkhau: matkhaumahoa,
      vaitro: 'user',
      trangthai: 'active',
      xacthuc: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
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
    const emaildangnhap = chuanHoaEmail(req.body.email);
    const matkhau = String(req.body.password || '');
    const ghinho = req.body.remember === 'on' || req.body.remember === '1' || req.body.remember === true;

    const taikhoan = await nguoidung.findOne({ email: emaildangnhap, daxoa: { $ne: true } });
    if (!taikhoan) {
      await writeLoginLog({ req, email: emaildangnhap, provider: 'local', status: 'failed', message: 'user_not_found' });
      req.flash('error', 'Sai email hoặc mật khẩu');
      return res.redirect('/auth?mode=login');
    }

    if (taikhoan.trangthai !== 'active') {
      await writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'failed', message: 'noactive' });
      req.flash('error', 'Tài khoản đang bị khóa');
      return res.redirect('/auth?mode=login');
    }

    const hople = await bcrypt.compare(matkhau, taikhoan.matkhau || '');
    if (!hople) {
      await writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'failed', message: 'wrong_password' });
      req.flash('error', 'Sai email hoặc mật khẩu');
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

    if (taikhoan.trangthai !== 'active') {
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
  })(req, res, next);
};
