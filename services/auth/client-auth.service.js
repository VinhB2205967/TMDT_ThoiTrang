const {
  chuanEmail,
  daCauHinhGoogle,
  goiYLoiGoogle,
  dangKyLocal,
  dangNhapLocal,
  danhDauOffline,
  chuanBiDangNhapGoogle,
  yeuCauDatLaiMK,
  kiemTraTokenReset,
  datLaiMKTheoToken,
  writeLoginLog
} = require('./index.js');

function tuyChonCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };
}

// Lưu dữ liệu form
function luuDuLieuForm(req, data = {}) {
  if (!req || !req.flash) return;
  req.flash('formData', JSON.stringify(data || {}));
}

// Lấy dữ liệu form đã lưu
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

// Kiểm tra nếu tài khoản đang đăng nhập có hoạt động hay không (dựa trên trạng thái của tài khoản)
function laTaiKhoanDangNhapHoatDong(user) {
  return !!(user && user.trangthai === 'active');
}

// Tạo dữ liệu cần render cho trang đăng nhập/đăng ký.
function taoDuLieuTrangDangNhap(req) {
  const chedo = req.query.mode === 'register' ? 'register' : 'login';
  const emaildanho = String(req.cookies?.rememberEmail || '').trim();
  const formData = layDuLieuForm(req);
  return {
    titlePage: chedo === 'register' ? 'Đăng ký' : 'Đăng nhập',
    mode: chedo,
    googleEnabled: daCauHinhGoogle(),
    rememberedEmail: emaildanho,
    formData
  };
}

// Xử lý đăng ký tài khoản local và trả kết quả cho controller.
async function xuLyDangKy(req) {
  const hoten = String(req.body.hoten || '').trim();
  const emaildangky = chuanEmail(req.body.email);

  try {
    await dangKyLocal({
      hoten,
      email: emaildangky,
      password: String(req.body.password || '')
    });

    return {
      ok: true,
      flashType: 'success',
      message: 'Đăng ký thành công. Vui lòng đăng nhập để tiếp tục.',
      redirect: '/auth?mode=login'
    };
  } catch (loi) {
    if (loi && (loi.code === 11000 || String(loi.message || '').includes('E11000'))) {
      luuDuLieuForm(req, { hoten, email: emaildangky });
      return {
        ok: false,
        flashType: 'error',
        message: 'Email đã tồn tại',
        redirect: '/auth?mode=register',
        error: loi
      };
    }

    luuDuLieuForm(req, { hoten, email: emaildangky });
    return {
      ok: false,
      flashType: 'error',
      message: loi?.message || 'Có lỗi khi đăng ký',
      redirect: '/auth?mode=register',
      error: loi
    };
  }
}

// Bao req.login thành Promise để dùng được với async/await.
function dangNhapReq(req, user) {
  return new Promise((resolve, reject) => {
    req.login(user, function (loi) {
      if (loi) return reject(loi);
      return resolve();
    });
  });
}

// Chuẩn hóa giá trị "ghi nhớ email" từ form đăng nhập.
function chonNhoEmail(remember) {
  return remember === 'on' || remember === '1' || remember === true;
}

// Xử lý đăng nhập local, đăng nhập session và ghi log đăng nhập.
async function xuLyDangNhap(req) {
  const emaildangnhap = chuanEmail(req.body.email);
  const ghinho = chonNhoEmail(req.body.remember);

  try {
    const { user } = await dangNhapLocal({
      req,
      email: emaildangnhap,
      password: String(req.body.password || '')
    });

    try {
      await dangNhapReq(req, user);
    } catch (loi) {
      await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'req_login_failed' });
      luuDuLieuForm(req, { email: emaildangnhap, remember: req.body.remember });
      return {
        ok: false,
        flashType: 'error',
        message: 'Đăng nhập thất bại',
        redirect: '/auth?mode=login',
        error: loi
      };
    }

    await writeLoginLog({ req, user, provider: 'local', status: 'success' });

    return {
      ok: true,
      user,
      rememberEmail: ghinho ? emaildangnhap : null
    };
  } catch (loi) {
    if (!['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED'].includes(String(loi?.code || ''))) {
      await writeLoginLog({ req, email: emaildangnhap, provider: 'local', status: 'failed', message: 'exception' });
    }

    luuDuLieuForm(req, { email: emaildangnhap, remember: req.body.remember });
    return {
      ok: false,
      flashType: 'error',
      message: loi?.message || 'Có lỗi khi đăng nhập',
      redirect: '/auth?mode=login',
      error: loi
    };
  }
}

// Xử lý đăng xuất và cập nhật trạng thái offline cho người dùng.
async function xuLyDangXuat(req) {
  const idnguoidung = req.user && req.user._id ? String(req.user._id) : null;
  await danhDauOffline({ userId: idnguoidung });
}

// Kiểm tra hệ thống đã cấu hình Google OAuth hay chưa.
function kiemTraGoogleAuth() {
  if (!daCauHinhGoogle()) {
    return {
      ok: false,
      message: 'Chưa cấu hình đúng Google Login (kiểm tra GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)',
      redirect: '/auth?mode=login'
    };
  }
  return { ok: true };
}

// Đọc lỗi Google OAuth từ query và tạo thông tin phản hồi phù hợp.
function xuLyLoiGoogleQuery(req) {
  if (!(req.query && req.query.error)) return null;

  const goiy = goiYLoiGoogle(null, req);
  return {
    shouldStop: true,
    log: { provider: 'google', status: 'failed', message: goiy || String(req.query.error || '') },
    message: goiy || 'Đăng nhập Google thất bại',
    redirect: '/auth?mode=login'
  };
}

// Trả về gợi ý lỗi thân thiện cho luồng đăng nhập Google.
function layGoiYLoiGoogle(loi, req) {
  return goiYLoiGoogle(loi, req);
}

// Hoàn tất đăng nhập sau khi Google xác thực thành công.
async function xuLyGoogleDaXacThuc(req, taikhoan) {
  const user = await chuanBiDangNhapGoogle({ req, user: taikhoan });
  await dangNhapReq(req, user);
  return user;
}

// Tạo dữ liệu render cho trang quên mật khẩu.
function getTrangQuenMatKhauData(req) {
  return {
    titlePage: 'Quên mật khẩu',
    formData: layDuLieuForm(req)
  };
}

// Gửi email đặt lại mật khẩu và trả thông tin phản hồi.
async function xuLyGuiEmailDatLai(req) {
  const email = chuanEmail(req.body.email);

  try {
    const { normalizedEmail, mailInfo } = await yeuCauDatLaiMK({ req, email });
    return {
      ok: true,
      normalizedEmail,
      mailInfo,
      flashType: 'success',
      message: 'Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.',
      redirect: '/forgot-password'
    };
  } catch (error) {
    if (error?.code === 'EMAIL_INVALID') luuDuLieuForm(req, { email });
    return {
      ok: false,
      flashType: 'error',
      message: error?.message || 'Không thể gửi email đặt lại mật khẩu lúc này',
      redirect: '/forgot-password',
      error
    };
  }
}

// Kiểm tra token reset để hiển thị trang đặt lại mật khẩu.
async function xuLyTrangDatLai(req) {
  const token = String(req.query.token || '').trim();

  try {
    await kiemTraTokenReset({ token });
    return {
      ok: true,
      data: {
        titlePage: 'Đặt lại mật khẩu',
        token
      }
    };
  } catch (error) {
    return {
      ok: false,
      flashType: 'error',
      message: error?.message || 'Liên kết đã hết hạn hoặc không hợp lệ',
      redirect: '/forgot-password'
    };
  }
}

// Đặt lại mật khẩu bằng token và trả điều hướng phù hợp.
async function xuLyDatLaiMatKhau(req) {
  const token = String(req.body.token || '').trim();

  try {
    await datLaiMKTheoToken({
      token,
      newPassword: String(req.body.password || ''),
      confirmPassword: String(req.body.confirmPassword || '')
    });

    return {
      ok: true,
      flashType: 'success',
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.',
      redirect: '/auth?mode=login'
    };
  } catch (error) {
    if (error?.code === 'PASSWORD_INVALID' || error?.code === 'PASSWORD_CONFIRM_MISMATCH') {
      return {
        ok: false,
        flashType: 'error',
        message: error?.message || 'Không thể đặt lại mật khẩu',
        redirect: `/reset-password?token=${encodeURIComponent(token)}`,
        error
      };
    }

    return {
      ok: false,
      flashType: 'error',
      message: error?.message || 'Không thể đặt lại mật khẩu',
      redirect: '/forgot-password',
      error
    };
  }
}

module.exports = {
  tuyChonCookie,
  laTaiKhoanDangNhapHoatDong,
  taoDuLieuTrangDangNhap,
  xuLyDangKy,
  xuLyDangNhap,
  xuLyDangXuat,
  kiemTraGoogleAuth,
  xuLyLoiGoogleQuery,
  layGoiYLoiGoogle,
  xuLyGoogleDaXacThuc,
  getTrangQuenMatKhauData,
  xuLyGuiEmailDatLai,
  xuLyTrangDatLai,
  xuLyDatLaiMatKhau,
  writeLoginLog
};

