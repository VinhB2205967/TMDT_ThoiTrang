const nguoidung = require('../../models/user_model');
const { writeLoginLog } = require('../loginLog');
const { laEmailHopLe } = require('../../helpers/validators');
const {
  taoTKLocal,
  xacThucKieuCu,
  layTKTheoId,
  damBaoTK,
  taoTokenReset,
  timTKTheoToken,
  xoaTokenTheoId,
  datMKTheoId
} = require('../account/index.js');
const { sendResetPasswordEmail } = require('../communication/mailer.service.js');

function chuanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function kiemTraMK(password) {
  const p = String(password || '');
  if (p.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
  return null;
}

function daCauHinhGoogle() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return false;
  if (clientSecret === 'NEW_SECRET_HERE' || clientSecret === 'YOUR_GOOGLE_CLIENT_SECRET') return false;
  return true;
}

function layBaseUrlReset(req) {
  const envBaseUrl = String(process.env.APP_BASE_URL || '').trim();
  if (envBaseUrl) return envBaseUrl.replace(/\/$/, '');
  const proto = req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}`;
}

function goiYLoiGoogle(err, req) {
  const queryError = String(req?.query?.error || '').trim();
  if (queryError) {
    if (queryError === 'access_denied') return 'Bạn đã từ chối đăng nhập Google.';
    return `Google trả lời: ${queryError}`;
  }

  const message = String(err?.message || err || '').toLowerCase();
  const oauthData = String(err?.oauthError?.data || '').toLowerCase();
  const composed = `${message} ${oauthData}`;

  if (composed.includes('redirect_uri_mismatch')) {
    return 'Sai Redirect URI. Hãy thêm đúng URL callback vào Google Console (Authorized redirect URIs).';
  }
  if (composed.includes('invalid_client') || composed.includes('unauthorized_client')) {
    return 'Sai GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET hoặc OAuth Client chưa đúng loại (Web application).';
  }
  if (composed.includes('invalid_grant')) {
    return 'Phiên đăng nhập Google hết hạn, thử lại.';
  }

  return '';
}

function taoLoi(message, code = 'BUSINESS_ERROR') {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function dangKyLocal({ hoten, email, password }) {
  const normalizedEmail = chuanEmail(email);
  const normalizedName = String(hoten || '').trim();
  const normalizedPassword = String(password || '');

  if (!normalizedEmail || !laEmailHopLe(normalizedEmail)) {
    throw taoLoi('Email không đúng định dạng', 'EMAIL_INVALID');
  }

  const passwordError = kiemTraMK(normalizedPassword);
  if (passwordError) throw taoLoi(passwordError, 'PASSWORD_INVALID');

  const existingUser = await nguoidung.findOne({ email: normalizedEmail, daxoa: { $ne: true } });
  if (existingUser) throw taoLoi('Email đã tồn tại', 'EMAIL_EXISTS');

  const user = await nguoidung.create({
    hoten: normalizedName || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  await taoTKLocal({
    userDoc: user,
    passwordPlain: normalizedPassword,
    overrides: { vaitro: 'user', trangthai: 'active', xacthuc: false }
  });

  return user;
}

async function dangNhapLocal({ req, email, password }) {
  const normalizedEmail = chuanEmail(email);
  const normalizedPassword = String(password || '');

  const user = await nguoidung.findOne({ email: normalizedEmail, daxoa: { $ne: true } });
  if (!user) {
    await writeLoginLog({ req, email: normalizedEmail, provider: 'local', status: 'failed', message: 'user_not_found' });
    throw taoLoi('Sai email hoặc mật khẩu', 'INVALID_CREDENTIALS');
  }

  const isValidPassword = await xacThucKieuCu({ userDoc: user, passwordPlain: normalizedPassword });
  if (!isValidPassword) {
    await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'wrong_password' });
    throw taoLoi('Sai email hoặc mật khẩu', 'INVALID_CREDENTIALS');
  }

  const account = await layTKTheoId({ userId: user._id }).catch(() => null);
  if (!account || account.trangthai !== 'active') {
    await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'noactive' });
    throw taoLoi('Tài khoản đang bị khóa', 'ACCOUNT_LOCKED');
  }

  await nguoidung.updateOne(
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

  return { user, normalizedEmail };
}

async function danhDauOffline({ userId }) {
  const uid = userId ? String(userId) : null;
  if (!uid) return;

  const onlineWindowMs = 5 * 60 * 1000;
  const offlineAt = new Date(Date.now() - onlineWindowMs - 1000);
  await nguoidung.updateOne(
    { _id: uid, daxoa: { $ne: true } },
    { $set: { lastSeenAt: offlineAt } }
  ).catch(() => {});
}

async function chuanBiDangNhapGoogle({ req, user }) {
  if (!user) {
    await writeLoginLog({ req, provider: 'google', status: 'failed', message: 'no_user' });
    throw taoLoi('Không thể lấy thông tin Google', 'GOOGLE_NO_USER');
  }

  const account = await layTKTheoId({ userId: user._id }).catch(() => null);
  if (!account || account.trangthai !== 'active') {
    await writeLoginLog({ req, user, provider: 'google', status: 'failed', message: 'noactive' });
    throw taoLoi('Tài khoản đang bị khóa', 'ACCOUNT_LOCKED');
  }

  await nguoidung.updateOne(
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

  return user;
}

async function yeuCauDatLaiMK({ req, email }) {
  const normalizedEmail = chuanEmail(email);
  if (!normalizedEmail || !laEmailHopLe(normalizedEmail)) {
    throw taoLoi('Email không đúng định dạng', 'EMAIL_INVALID');
  }

  const user = await nguoidung.findOne({ email: normalizedEmail, daxoa: { $ne: true } }).lean();
  if (!user) throw taoLoi('Email không tồn tại', 'EMAIL_NOT_FOUND');

  await damBaoTK(user, { provider: 'local' });
  const tokenInfo = await taoTokenReset({ userId: user._id, expiresMinutes: 15 });
  const resetLink = `${layBaseUrlReset(req)}/reset-password?token=${encodeURIComponent(tokenInfo.tokenPlain)}`;

  const mailInfo = await sendResetPasswordEmail({
    toEmail: normalizedEmail,
    userName: user.hoten || normalizedEmail.split('@')[0],
    resetLink,
    minutes: tokenInfo.expiresMinutes
  });

  return { normalizedEmail, mailInfo };
}

async function kiemTraTokenReset({ token }) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw taoLoi('Liên kết đặt lại mật khẩu không hợp lệ', 'RESET_TOKEN_INVALID');
  }

  const account = await timTKTheoToken({ tokenPlain: normalizedToken });
  if (!account) {
    throw taoLoi('Liên kết đã hết hạn hoặc không hợp lệ', 'RESET_TOKEN_EXPIRED');
  }

  return account;
}

async function datLaiMKTheoToken({ token, newPassword, confirmPassword }) {
  const normalizedToken = String(token || '').trim();
  const password = String(newPassword || '');
  const confirm = String(confirmPassword || '');

  if (!normalizedToken) {
    throw taoLoi('Thiếu token đặt lại mật khẩu', 'RESET_TOKEN_MISSING');
  }

  const account = await kiemTraTokenReset({ token: normalizedToken });

  const passwordError = kiemTraMK(password);
  if (passwordError) throw taoLoi(passwordError, 'PASSWORD_INVALID');

  if (password !== confirm) {
    throw taoLoi('Xác nhận mật khẩu không khớp', 'PASSWORD_CONFIRM_MISMATCH');
  }

  await datMKTheoId({ userId: account.nguoidung_id, newPasswordPlain: password });
  await xoaTokenTheoId({ userId: account.nguoidung_id });

  return true;
}

module.exports = {
  chuanEmail,
  kiemTraMK,
  daCauHinhGoogle,
  goiYLoiGoogle,
  dangKyLocal,
  dangNhapLocal,
  danhDauOffline,
  chuanBiDangNhapGoogle,
  yeuCauDatLaiMK,
  kiemTraTokenReset,
  datLaiMKTheoToken,
  taoLoi,
  writeLoginLog
};



