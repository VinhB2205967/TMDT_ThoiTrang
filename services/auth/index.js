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
  if (p.length < 6) return 'Máº­t kháº©u pháº£i tá»‘i thiá»ƒu 6 kÃ½ tá»±';
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
    if (queryError === 'access_denied') return 'Báº¡n Ä‘Ã£ há»§y/khÃ´ng cáº¥p quyá»n cho Google.';
    return `Google tráº£ vá» lá»—i: ${queryError}`;
  }

  const message = String(err?.message || err || '').toLowerCase();
  const oauthData = String(err?.oauthError?.data || '').toLowerCase();
  const composed = `${message} ${oauthData}`;

  if (composed.includes('redirect_uri_mismatch')) {
    return 'Sai Redirect URI. HÃ£y thÃªm Ä‘Ãºng URL callback vÃ o Google Console (Authorized redirect URIs).';
  }
  if (composed.includes('invalid_client') || composed.includes('unauthorized_client')) {
    return 'Sai GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET hoáº·c OAuth Client chÆ°a Ä‘Ãºng loáº¡i (Web application).';
  }
  if (composed.includes('invalid_grant')) {
    return 'PhiÃªn Ä‘Äƒng nháº­p Google háº¿t háº¡n, thá»­ láº¡i.';
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
    throw createHandledError('Email khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng', 'EMAIL_INVALID');
  }

  const passwordError = validatePassword(normalizedPassword);
  if (passwordError) throw createHandledError(passwordError, 'PASSWORD_INVALID');

  const existingUser = await nguoidung.findOne({ email: normalizedEmail, daxoa: { $ne: true } });
  if (existingUser) throw createHandledError('Email Ä‘Ã£ tá»“n táº¡i', 'EMAIL_EXISTS');

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
    throw createHandledError('Sai email hoáº·c máº­t kháº©u', 'INVALID_CREDENTIALS');
  }

  const isValidPassword = await verifyPasswordWithLegacy({ userDoc: user, passwordPlain: normalizedPassword });
  if (!isValidPassword) {
    await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'wrong_password' });
    throw createHandledError('Sai email hoáº·c máº­t kháº©u', 'INVALID_CREDENTIALS');
  }

  const account = await getAccountByUserId({ userId: user._id }).catch(() => null);
  if (!account || account.trangthai !== 'active') {
    await writeLoginLog({ req, user, provider: 'local', status: 'failed', message: 'noactive' });
    throw createHandledError('TÃ i khoáº£n Ä‘ang bá»‹ khÃ³a', 'ACCOUNT_LOCKED');
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
    throw createHandledError('KhÃ´ng thá»ƒ láº¥y thÃ´ng tin Google', 'GOOGLE_NO_USER');
  }

  const account = await getAccountByUserId({ userId: user._id }).catch(() => null);
  if (!account || account.trangthai !== 'active') {
    await writeLoginLog({ req, user, provider: 'google', status: 'failed', message: 'noactive' });
    throw createHandledError('TÃ i khoáº£n Ä‘ang bá»‹ khÃ³a', 'ACCOUNT_LOCKED');
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
    throw createHandledError('Email khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng', 'EMAIL_INVALID');
  }

  const user = await nguoidung.findOne({ email: normalizedEmail, daxoa: { $ne: true } }).lean();
  if (!user) throw createHandledError('Email khÃ´ng tá»“n táº¡i trong há»‡ thá»‘ng', 'EMAIL_NOT_FOUND');

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
    throw createHandledError('LiÃªn káº¿t Ä‘áº·t láº¡i máº­t kháº©u khÃ´ng há»£p lá»‡', 'RESET_TOKEN_INVALID');
  }

  const account = await findAccountByResetToken({ tokenPlain: normalizedToken });
  if (!account) {
    throw createHandledError('LiÃªn káº¿t Ä‘Ã£ háº¿t háº¡n hoáº·c khÃ´ng há»£p lá»‡', 'RESET_TOKEN_EXPIRED');
  }

  return account;
}

async function resetPasswordByToken({ token, newPassword, confirmPassword }) {
  const normalizedToken = String(token || '').trim();
  const password = String(newPassword || '');
  const confirm = String(confirmPassword || '');

  if (!normalizedToken) {
    throw createHandledError('Thiáº¿u token Ä‘áº·t láº¡i máº­t kháº©u', 'RESET_TOKEN_MISSING');
  }

  const account = await validateResetToken({ token: normalizedToken });

  const passwordError = validatePassword(password);
  if (passwordError) throw createHandledError(passwordError, 'PASSWORD_INVALID');

  if (password !== confirm) {
    throw createHandledError('XÃ¡c nháº­n máº­t kháº©u khÃ´ng khá»›p', 'PASSWORD_CONFIRM_MISMATCH');
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

