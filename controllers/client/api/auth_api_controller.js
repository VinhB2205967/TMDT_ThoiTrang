const nguoidung = require('../../../models/user_model');
const { laEmailHopLe } = require('../../../helpers/validators');
const { writeLoginLog } = require('../../../services/loginLog');
const {
  createLocalAccountForUser,
  verifyPasswordWithLegacy,
  getAccountByUserId,
  ensureAccountFromUser,
  createPasswordResetToken,
  findAccountByResetToken,
  clearPasswordResetTokenByUserId,
  setPasswordByUserId
} = require('../../../services/account.service');
const { sendResetPasswordEmail } = require('../../../services/mailer.service');

function chuanHoaEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function kiemTraMatKhau(password) {
  const matkhau = String(password || '');
  if (matkhau.length < 6) return 'Mật khẩu phải tối thiểu 6 ký tự';
  return null;
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

function redirectPathForUser(user) {
  return user && user.vaitro === 'admin' ? '/admin' : '/';
}

module.exports.register = async (req, res) => {
  try {
    const hoten = String(req.body.hoten || '').trim();
    const emaildangky = chuanHoaEmail(req.body.email);
    const matkhau = String(req.body.password || '');

    if (!emaildangky || !laEmailHopLe(emaildangky)) {
      return res.status(400).json({ success: false, message: 'Email không đúng định dạng' });
    }

    const loimatkhau = kiemTraMatKhau(matkhau);
    if (loimatkhau) {
      return res.status(400).json({ success: false, message: loimatkhau });
    }

    const nguoidungtontai = await nguoidung.findOne({ email: emaildangky, daxoa: { $ne: true } });
    if (nguoidungtontai) {
      return res.status(409).json({ success: false, message: 'Email đã tồn tại' });
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

    return res.status(201).json({ success: true, message: 'Đăng ký thành công' });
  } catch (loi) {
    console.error('authApi.register error:', loi);
    if (loi && (loi.code === 11000 || String(loi.message || '').includes('E11000'))) {
      return res.status(409).json({ success: false, message: 'Email đã tồn tại' });
    }
    return res.status(500).json({ success: false, message: 'Có lỗi khi đăng ký' });
  }
};

module.exports.login = async (req, res) => {
  try {
    const emaildangnhap = chuanHoaEmail(req.body.email);
    const matkhau = String(req.body.password || '');
    const ghinho = req.body.remember === 'on' || req.body.remember === '1' || req.body.remember === true;

    const taikhoan = await nguoidung.findOne({ email: emaildangnhap, daxoa: { $ne: true } });
    if (!taikhoan) {
      await writeLoginLog({ req, email: emaildangnhap, provider: 'local', status: 'failed', message: 'user_not_found' });
      return res.status(401).json({ success: false, message: 'Sai email hoặc mật khẩu' });
    }

    const hople = await verifyPasswordWithLegacy({ userDoc: taikhoan, passwordPlain: matkhau });
    if (!hople) {
      await writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'failed', message: 'wrong_password' });
      return res.status(401).json({ success: false, message: 'Sai email hoặc mật khẩu' });
    }

    const acc = await getAccountByUserId({ userId: taikhoan._id }).catch(() => null);
    if (!acc || acc.trangthai !== 'active') {
      await writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'failed', message: 'noactive' });
      return res.status(403).json({ success: false, message: 'Tài khoản đang bị khóa' });
    }

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

    return req.login(taikhoan, async (loi) => {
      if (loi) {
        await writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'failed', message: 'req_login_failed' });
        return res.status(500).json({ success: false, message: 'Đăng nhập thất bại' });
      }

      await writeLoginLog({ req, user: taikhoan, provider: 'local', status: 'success' });

      if (ghinho) {
        res.cookie('rememberEmail', emaildangnhap, { ...tuyChonCookie(), maxAge: 30 * 24 * 60 * 60 * 1000 });
      } else {
        res.clearCookie('rememberEmail', tuyChonCookie());
      }

      return res.json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          redirect: redirectPathForUser(taikhoan),
          user: {
            id: String(taikhoan._id),
            hoten: String(taikhoan.hoten || ''),
            email: String(taikhoan.email || ''),
            vaitro: String(taikhoan.vaitro || 'user')
          }
        }
      });
    });
  } catch (loi) {
    console.error('authApi.login error:', loi);
    await writeLoginLog({ req, email: chuanHoaEmail(req.body.email), provider: 'local', status: 'failed', message: 'exception' });
    return res.status(500).json({ success: false, message: 'Có lỗi khi đăng nhập' });
  }
};

module.exports.logout = async (req, res) => {
  const idnguoidung = req.user && req.user._id ? String(req.user._id) : null;

  if (idnguoidung) {
    const onlinewindowms = 5 * 60 * 1000;
    const thoidiemoffline = new Date(Date.now() - onlinewindowms - 1000);
    nguoidung.updateOne(
      { _id: idnguoidung, daxoa: { $ne: true } },
      { $set: { lastSeenAt: thoidiemoffline } }
    ).catch(() => {});
  }

  return req.logout(() => {
    return res.json({ success: true, message: 'Đã đăng xuất' });
  });
};

module.exports.forgotPassword = async (req, res) => {
  try {
    const email = chuanHoaEmail(req.body.email);
    if (!email || !laEmailHopLe(email)) {
      return res.status(400).json({ success: false, message: 'Email không đúng định dạng' });
    }

    const user = await nguoidung.findOne({ email, daxoa: { $ne: true } }).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống' });
    }

    await ensureAccountFromUser(user, { provider: 'local' });
    const tokenInfo = await createPasswordResetToken({ userId: user._id, expiresMinutes: 15 });
    const resetLink = `${getAppBaseUrl(req)}/reset-password?token=${encodeURIComponent(tokenInfo.tokenPlain)}`;

    await sendResetPasswordEmail({
      toEmail: email,
      userName: user.hoten || email.split('@')[0],
      resetLink,
      minutes: tokenInfo.expiresMinutes
    });

    return res.json({ success: true, message: 'Đã gửi email đặt lại mật khẩu' });
  } catch (error) {
    console.error('authApi.forgotPassword error:', error);
    return res.status(500).json({ success: false, message: 'Không thể gửi email đặt lại mật khẩu lúc này' });
  }
};

module.exports.resetPassword = async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!token) {
      return res.status(400).json({ success: false, message: 'Thiếu token đặt lại mật khẩu' });
    }

    const account = await findAccountByResetToken({ tokenPlain: token });
    if (!account) {
      return res.status(400).json({ success: false, message: 'Liên kết đã hết hạn hoặc không hợp lệ' });
    }

    const passwordError = kiemTraMatKhau(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    if (newPassword !== confirmPassword) {
	  return res.status(400).json({ success: false, message: 'Xác nhận mật khẩu không khớp' });
    }

    await setPasswordByUserId({ userId: account.nguoidung_id, newPasswordPlain: newPassword });
    await clearPasswordResetTokenByUserId({ userId: account.nguoidung_id });

    return res.json({ success: true, message: 'Đặt lại mật khẩu thành công' });
  } catch (error) {
    console.error('authApi.resetPassword error:', error);
    return res.status(500).json({ success: false, message: 'Không thể đặt lại mật khẩu' });
  }
};


