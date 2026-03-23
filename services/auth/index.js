const nguoidung = require('../../models/user_model');
const { writeLoginLog } = require('../loginLog');
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
} = require('../account/index.js');
const { sendResetPasswordEmail } = require('../communication/mailer.service.js');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePassword(password) {
  const p = String(password || '');
  if (p.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
  return null;
}

function isGoogleAuthConfigured() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return false;
  if (clientSecret === 'NEW_SECRET_HERE' || clientSecret === 'YOUR_GOOGLE_CLIENT_SECRET') return false;
  return true;
}

function getResetBaseUrl(req) {
  const envBaseUrl = String(process.env.APP_BASE_URL || '').trim();
  if (envBaseUrl) return envBaseUrl.replace(/\/$/, '');
  const proto = req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}`;
}

function getGoogleAuthHint(err, req) {
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

function createHandledError(message, code = 'BUSINESS_ERROR') {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function registerLocalUser({ hoten, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(hoten || '').trim();
  const normalizedPassword = String(password || '');

  if (!normalizedEmail || !laEmailHopLe(normalizedEmail)) {
    throw createHandledError('Email không đúng định dạng', 'EMAIL_INVALID');
  }

  const passwordError = validatePassword(normalizedPassword);
  if (passwordError) throw createHandledError(passwordError, 'PASSWORD_INVALID');

  const existingUser = await nguoidung.findOne({ email: normalizedEmail, daxoa: { $ne: true } });
  if (existingUser) throw createHandledError('Email đã tồn tại', 'EMAIL_EXISTS');

  const user = await nguoidung.create({
    hoten: normalizedName || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  await createLocalAccountForUser({
    userDoc: user,
    passwordPlain: normalizedPassword,
    overrides: { vaitro: 'user', trangthai: 'active', xacthuc: false }
  });

  return user;
}

async function authenticateLocalUser({ req, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || '');

  const user = await nguoidung.findOne({ email: normalizedEmail, daxoa: { $ne: true } });
  if (!user) {
    await writeLoginLog({ req, email: normalizedEmail, provider: 'local', status: 'failed', message: 'user_not_found' });
    throw createHandledError('Sai email hoặc mật khẩu', 'INVALID_CREDENTIALS');
  }

  const isValidPassword = await verifyPasswordWithLegacy({ userDoc: user, passwordPlain: normalizedPassword });
  if (!isValidPassword) {
    await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'wrong_password' });
    throw createHandledError('Sai email hoặc mật khẩu', 'INVALID_CREDENTIALS');
  }

  const account = await getAccountByUserId({ userId: user._id }).catch(() => null);
  if (!account || account.trangthai !== 'active') {
    await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'noactive' });
    throw createHandledError('Tài khoản đang bị khóa', 'ACCOUNT_LOCKED');
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

async function markUserOffline({ userId }) {
  const uid = userId ? String(userId) : null;
  if (!uid) return;

  const onlineWindowMs = 5 * 60 * 1000;
  const offlineAt = new Date(Date.now() - onlineWindowMs - 1000);
  await nguoidung.updateOne(
    { _id: uid, daxoa: { $ne: true } },
    { $set: { lastSeenAt: offlineAt } }
  ).catch(() => {});
}

async function prepareGoogleUserLogin({ req, user }) {
  if (!user) {
    await writeLoginLog({ req, provider: 'google', status: 'failed', message: 'no_user' });
    throw createHandledError('Không thể lấy thông tin Google', 'GOOGLE_NO_USER');
  }

  const account = await getAccountByUserId({ userId: user._id }).catch(() => null);
  if (!account || account.trangthai !== 'active') {
    await writeLoginLog({ req, user, provider: 'google', status: 'failed', message: 'noactive' });
    throw createHandledError('Tài khoản đang bị khóa', 'ACCOUNT_LOCKED');
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

async function requestPasswordReset({ req, email }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !laEmailHopLe(normalizedEmail)) {
    throw createHandledError('Email không đúng định dạng', 'EMAIL_INVALID');
  }

  const user = await nguoidung.findOne({ email: normalizedEmail, daxoa: { $ne: true } }).lean();
  if (!user) throw createHandledError('Email không tồn tại trong hệ thống', 'EMAIL_NOT_FOUND');

  await ensureAccountFromUser(user, { provider: 'local' });
  const tokenInfo = await createPasswordResetToken({ userId: user._id, expiresMinutes: 15 });
  const resetLink = `${getResetBaseUrl(req)}/reset-password?token=${encodeURIComponent(tokenInfo.tokenPlain)}`;

  const mailInfo = await sendResetPasswordEmail({
    toEmail: normalizedEmail,
    userName: user.hoten || normalizedEmail.split('@')[0],
    resetLink,
    minutes: tokenInfo.expiresMinutes
  });

  return { normalizedEmail, mailInfo };
}

async function validateResetToken({ token }) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw createHandledError('Liên kết đặt lại mật khẩu không hợp lệ', 'RESET_TOKEN_INVALID');
  }

  const account = await findAccountByResetToken({ tokenPlain: normalizedToken });
  if (!account) {
    throw createHandledError('Liên kết đã hết hạn hoặc không hợp lệ', 'RESET_TOKEN_EXPIRED');
  }

  return account;
}

async function resetPasswordByToken({ token, newPassword, confirmPassword }) {
  const normalizedToken = String(token || '').trim();
  const password = String(newPassword || '');
  const confirm = String(confirmPassword || '');

  if (!normalizedToken) {
    throw createHandledError('Thiếu token đặt lại mật khẩu', 'RESET_TOKEN_MISSING');
  }

  const account = await validateResetToken({ token: normalizedToken });

  const passwordError = validatePassword(password);
  if (passwordError) throw createHandledError(passwordError, 'PASSWORD_INVALID');

  if (password !== confirm) {
    throw createHandledError('Xác nhận mật khẩu không khớp', 'PASSWORD_CONFIRM_MISMATCH');
  }

  await setPasswordByUserId({ userId: account.nguoidung_id, newPasswordPlain: password });
  await clearPasswordResetTokenByUserId({ userId: account.nguoidung_id });

  return true;
}

module.exports = {
  normalizeEmail,
  validatePassword,
  isGoogleAuthConfigured,
  getGoogleAuthHint,
  registerLocalUser,
  authenticateLocalUser,
  markUserOffline,
  prepareGoogleUserLogin,
  requestPasswordReset,
  validateResetToken,
  resetPasswordByToken,
  createHandledError,
  writeLoginLog
};

