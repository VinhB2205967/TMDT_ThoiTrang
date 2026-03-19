const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const Taikhoan = require('../../models/accounts_model');
const Nguoidung = require('../../models/user_model');
const { chuanHoaSoDienThoai, laSoDienThoaiVN, laUrlAnhAnToan } = require('../../helpers/validators');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeId(id) {
  return id ? String(id) : null;
}

function normalizeRole(vaitro) {
  const r = String(vaitro || '').trim();
  return r === 'admin' ? 'admin' : 'user';
}

function normalizeStatus(trangthai) {
  const s = String(trangthai || '').trim();
  return s === 'noactive' ? 'noactive' : 'active';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function formatDateInput(d) {
  try {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

function validateNewPassword(password) {
  const p = String(password || '');
  if (p.length < 6) return 'Máº­t kháº©u pháº£i tá»‘i thiá»ƒu 6 kÃ½ tá»±';
  return null;
}

function createHandledError(message, code = 'BUSINESS_ERROR') {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function fetchLegacyAuthFieldsByUserId(userId) {
  const uid = normalizeId(userId);
  if (!uid || !mongoose.Types.ObjectId.isValid(uid)) return null;

  return Nguoidung.collection.findOne(
    { _id: new mongoose.Types.ObjectId(uid) },
    {
      projection: {
        email: 1,
        matkhau: 1,
        vaitro: 1,
        trangthai: 1,
        xacthuc: 1,
        tokenxacthuc: 1,
        tokenquenmatkhau: 1,
        thoigianhethan: 1
      }
    }
  );
}

async function ensureAccountFromUser(userDoc, { provider, overrides } = {}) {
  if (!userDoc || !userDoc._id) throw new Error('Thiáº¿u user');

  const uid = normalizeId(userDoc._id);
  const email = normalizeEmail(userDoc.email);
  const now = new Date();

  const ov = overrides || {};

  await Taikhoan.updateOne(
    { nguoidung_id: uid },
    {
      $set: {
        email,
        provider: provider || 'local',
        vaitro: normalizeRole(ov.vaitro ?? userDoc.vaitro ?? 'user'),
        trangthai: normalizeStatus(ov.trangthai ?? userDoc.trangthai ?? 'active'),
        xacthuc: typeof ov.xacthuc === 'boolean' ? ov.xacthuc : Boolean(userDoc.xacthuc),
        tokenxacthuc: ov.tokenxacthuc ?? userDoc.tokenxacthuc ?? undefined,
        tokenquenmatkhau: ov.tokenquenmatkhau ?? userDoc.tokenquenmatkhau ?? undefined,
        thoigianhethan: ov.thoigianhethan ?? userDoc.thoigianhethan ?? undefined,
        ngaycapnhat: now
      },
      $setOnInsert: {
        ngaytao: now
      }
    },
    { upsert: true }
  );

  return true;
}

async function createLocalAccountForUser({ userDoc, passwordPlain, overrides } = {}) {
  if (!userDoc || !userDoc._id) throw new Error('Thiáº¿u user');
  const uid = normalizeId(userDoc._id);
  const email = normalizeEmail(userDoc.email);

  const password = String(passwordPlain || '');
  if (password.length < 6) throw new Error('Máº­t kháº©u pháº£i tá»‘i thiá»ƒu 6 kÃ½ tá»±');

  const hash = await bcrypt.hash(password, 10);
  const now = new Date();

  const ov = overrides || {};

  await Taikhoan.updateOne(
    { nguoidung_id: uid },
    {
      $set: {
        email,
        matkhau: hash,
        provider: 'local',
        vaitro: normalizeRole(ov.vaitro ?? userDoc.vaitro ?? 'user'),
        trangthai: normalizeStatus(ov.trangthai ?? userDoc.trangthai ?? 'active'),
        xacthuc: typeof ov.xacthuc === 'boolean' ? ov.xacthuc : Boolean(userDoc.xacthuc),
        ngaycapnhat: now
      },
      $setOnInsert: {
        ngaytao: now
      }
    },
    { upsert: true }
  );

  // best-effort: remove legacy field from users if any
  await Nguoidung.updateOne({ _id: uid }, { $unset: { matkhau: '' }, $set: { ngaycapnhat: now } }).catch(() => {});

  return true;
}

async function findAccountByEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  return Taikhoan.findOne({ email: e }).lean();
}

async function getAccountByUserId({ userId }) {
  const uid = normalizeId(userId);
  if (!uid) return null;
  return Taikhoan.findOne({ nguoidung_id: uid }).select('-matkhau').lean();
}

async function hasLocalPassword({ userId }) {
  const uid = normalizeId(userId);
  if (!uid) return false;

  const account = await Taikhoan.findOne({ nguoidung_id: uid }).select('matkhau').lean();
  if (account && String(account.matkhau || '').trim()) return true;

  const legacy = await fetchLegacyAuthFieldsByUserId(uid);
  return Boolean(String(legacy?.matkhau || '').trim());
}

async function getProfilePageData({ userId, fallbackUser } = {}) {
  const uid = normalizeId(userId || fallbackUser?._id);
  const profileUser = fallbackUser || {};

  let coMatKhau = Boolean(profileUser?.matkhau);
  let loaiTaiKhoan = 'local';

  if (uid) {
    const account = await getAccountByUserId({ userId: uid });
    if (account && account.provider) loaiTaiKhoan = String(account.provider);
    coMatKhau = await hasLocalPassword({ userId: uid });
  }

  return {
    profile: {
      hoten: profileUser?.hoten || '',
      email: profileUser?.email || '',
      sodienthoai: profileUser?.sodienthoai || '',
      diachi: profileUser?.diachi || '',
      gioitinh: profileUser?.gioitinh || '',
      ngaysinh: formatDateInput(profileUser?.ngaysinh),
      avatar: profileUser?.avatar || ''
    },
    hasPassword: coMatKhau,
    canChangePassword: loaiTaiKhoan !== 'google'
  };
}

async function updateUserProfile({ userId, payload, fileUpload, currentAvatar } = {}) {
  const uid = normalizeId(userId);
  if (!uid) throw createHandledError('Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i', 'AUTH_REQUIRED');

  const hoten = normalizeText(payload?.hoten);
  const sdtraw = normalizeText(payload?.sodienthoai);
  if (sdtraw && !laSoDienThoaiVN(sdtraw)) {
    throw createHandledError('Sá»‘ Ä‘iá»‡n thoáº¡i khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng', 'INVALID_PHONE');
  }

  const sodienthoai = sdtraw ? chuanHoaSoDienThoai(sdtraw) : '';
  const diachi = normalizeText(payload?.diachi);
  const gioitinh = normalizeText(payload?.gioitinh);
  const avatarurl = normalizeText(payload?.avatarUrl || payload?.avatar);

  if (avatarurl && !laUrlAnhAnToan(avatarurl)) {
    throw createHandledError('Avatar URL khÃ´ng há»£p lá»‡', 'INVALID_AVATAR_URL');
  }

  let ngaysinh = null;
  if (payload?.ngaysinh) {
    const ngayparsed = new Date(payload.ngaysinh);
    if (!Number.isNaN(ngayparsed.getTime())) ngaysinh = ngayparsed;
  }

  let avatar = '';
  if (fileUpload && fileUpload.filename) {
    avatar = `/uploads/avatars/${fileUpload.filename}`;

    const avatarcu = String(currentAvatar || '');
    if (avatarcu.startsWith('/uploads/avatars/')) {
      const tencu = path.basename(avatarcu);
      const duongdancu = path.join(process.cwd(), 'public', 'uploads', 'avatars', tencu);
      fs.promises.unlink(duongdancu).catch(() => {});
    }
  }

  if (!avatar && avatarurl) avatar = avatarurl;

  const $set = {
    hoten,
    sodienthoai,
    diachi,
    gioitinh,
    ngaysinh,
    ngaycapnhat: new Date()
  };

  if (avatar) $set.avatar = avatar;

  await Nguoidung.updateOne(
    { _id: uid, daxoa: { $ne: true } },
    { $set }
  );

  return true;
}

async function changeUserPassword({ userId, oldPassword, newPassword, confirmPassword } = {}) {
  const uid = normalizeId(userId);
  if (!uid) throw createHandledError('Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i', 'AUTH_REQUIRED');

  const account = await getAccountByUserId({ userId: uid });
  if (account && String(account.provider || '') === 'google') {
    throw createHandledError('TÃ i khoáº£n Google khÃ´ng há»— trá»£ Ä‘á»•i máº­t kháº©u táº¡i Ä‘Ã¢y', 'GOOGLE_ACCOUNT');
  }

  const matkhaucu = String(oldPassword || '');
  const matkhaumoi = String(newPassword || '');
  const xacnhanmatkhau = String(confirmPassword || '');

  const loimatkhau = validateNewPassword(matkhaumoi);
  if (loimatkhau) throw createHandledError(loimatkhau, 'INVALID_PASSWORD');

  if (matkhaumoi !== xacnhanmatkhau) {
    throw createHandledError('XÃ¡c nháº­n máº­t kháº©u khÃ´ng khá»›p', 'PASSWORD_CONFIRM_MISMATCH');
  }

  const taikhoan = await Nguoidung.findOne({ _id: uid, daxoa: { $ne: true } });
  if (!taikhoan) throw createHandledError('KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n', 'ACCOUNT_NOT_FOUND');

  const daCoMatKhau = (await hasLocalPassword({ userId: uid })) || Boolean(taikhoan.matkhau);
  if (daCoMatKhau) {
    const hople = await verifyPasswordWithLegacy({ userDoc: taikhoan, passwordPlain: matkhaucu });
    if (!hople) throw createHandledError('Máº­t kháº©u hiá»‡n táº¡i khÃ´ng Ä‘Ãºng', 'OLD_PASSWORD_INVALID');
  }

  await setPasswordByUserId({ userId: uid, newPasswordPlain: matkhaumoi });
  await Nguoidung.updateOne(
    { _id: uid, daxoa: { $ne: true } },
    { $set: { ngaycapnhat: new Date() } }
  );

  return true;
}

async function softDeleteUserAccount({ userId } = {}) {
  const uid = normalizeId(userId);
  if (!uid) throw createHandledError('Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i', 'AUTH_REQUIRED');

  await Nguoidung.updateOne(
    { _id: uid, daxoa: { $ne: true } },
    { $set: { daxoa: true, trangthai: 'noactive', ngaycapnhat: new Date() } }
  );

  const onlinewindowms = 5 * 60 * 1000;
  const thoidiemoffline = new Date(Date.now() - onlinewindowms - 1000);
  Nguoidung.updateOne(
    { _id: uid },
    { $set: { lastSeenAt: thoidiemoffline } }
  ).catch(() => {});

  return true;
}

async function verifyPasswordByEmail({ email, passwordPlain }) {
  const acc = await findAccountByEmail(email);
  if (!acc) return { ok: false, userId: null, account: null };

  const password = String(passwordPlain || '');
  const hash = String(acc.matkhau || '');
  if (!hash) return { ok: false, userId: String(acc.nguoidung_id), account: acc };

  const ok = await bcrypt.compare(password, hash);
  return { ok, userId: String(acc.nguoidung_id), account: acc };
}

// KhÃ´ng cáº§n script: user cÅ© Ä‘Äƒng nháº­p báº±ng users.matkhau sáº½ tá»± táº¡o record accounts.
async function verifyPasswordWithLegacy({ userDoc, passwordPlain }) {
  if (!userDoc || !userDoc._id) return false;

  const uid = normalizeId(userDoc._id);
  const email = normalizeEmail(userDoc.email);
  const password = String(passwordPlain || '');

  const acc = await Taikhoan.findOne({ nguoidung_id: uid }).lean();
  if (acc && acc.matkhau) {
    return bcrypt.compare(password, String(acc.matkhau || ''));
  }

  // legacy auth fields may no longer be in the Mongoose schema -> read raw from collection
  const legacy = await fetchLegacyAuthFieldsByUserId(uid);
  let legacyHash = String(legacy?.matkhau || '');
  if (!legacyHash) return false;

  const ok = await bcrypt.compare(password, legacyHash);
  if (!ok) return false;

  const now = new Date();
  await Taikhoan.updateOne(
    { nguoidung_id: uid },
    {
      $set: {
        email: email || normalizeEmail(legacy?.email),
        matkhau: legacyHash,
        provider: 'local',
        vaitro: normalizeRole(legacy?.vaitro ?? userDoc.vaitro ?? 'user'),
        trangthai: normalizeStatus(legacy?.trangthai ?? userDoc.trangthai ?? 'active'),
        xacthuc: typeof legacy?.xacthuc === 'boolean' ? legacy.xacthuc : Boolean(userDoc.xacthuc),
        ngaycapnhat: now
      },
      $setOnInsert: {
        ngaytao: now
      }
    },
    { upsert: true }
  );

  // remove legacy password to meet requirement (best-effort)
  await Nguoidung.updateOne({ _id: uid }, { $unset: { matkhau: '' }, $set: { ngaycapnhat: now } }).catch(() => {});

  return true;
}

async function setPasswordByUserId({ userId, newPasswordPlain }) {
  const uid = normalizeId(userId);
  if (!uid) throw new Error('Thiáº¿u userId');

  const password = String(newPasswordPlain || '');
  if (password.length < 6) throw new Error('Máº­t kháº©u pháº£i tá»‘i thiá»ƒu 6 kÃ½ tá»±');

  const hash = await bcrypt.hash(password, 10);
  const now = new Date();

  await Taikhoan.updateOne(
    { nguoidung_id: uid },
    { $set: { matkhau: hash, provider: 'local', ngaycapnhat: now }, $setOnInsert: { ngaytao: now } },
    { upsert: true }
  );

  await Nguoidung.updateOne({ _id: uid }, { $unset: { matkhau: '' }, $set: { ngaycapnhat: now } }).catch(() => {});

  return true;
}

async function syncRoleStatusFromUser({ userId, vaitro, trangthai }) {
  const uid = normalizeId(userId);
  if (!uid) return;

  const $set = { ngaycapnhat: new Date() };
  if (vaitro) $set.vaitro = vaitro;
  if (trangthai) $set.trangthai = trangthai;

  await Taikhoan.updateOne({ nguoidung_id: uid }, { $set }, { upsert: true }).catch(() => {});
}

function hashResetToken(tokenPlain) {
  return crypto.createHash('sha256').update(String(tokenPlain || '')).digest('hex');
}

async function createPasswordResetToken({ userId, expiresMinutes = 15 }) {
  const uid = normalizeId(userId);
  if (!uid) throw new Error('Thiáº¿u userId');

  const minutes = Math.max(1, Number(expiresMinutes || 15));
  const tokenPlain = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(tokenPlain);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  await Taikhoan.updateOne(
    { nguoidung_id: uid },
    {
      $set: {
        tokenquenmatkhau: tokenHash,
        thoigianhethan: expiresAt,
        ngaycapnhat: new Date()
      }
    }
  );

  return {
    tokenPlain,
    expiresAt,
    expiresMinutes: minutes
  };
}

async function findAccountByResetToken({ tokenPlain }) {
  const token = String(tokenPlain || '').trim();
  if (!token) return null;

  const tokenHash = hashResetToken(token);
  const now = new Date();
  const account = await Taikhoan.findOne({
    tokenquenmatkhau: tokenHash,
    thoigianhethan: { $gt: now }
  }).lean();

  return account || null;
}

async function clearPasswordResetTokenByUserId({ userId }) {
  const uid = normalizeId(userId);
  if (!uid) return;

  await Taikhoan.updateOne(
    { nguoidung_id: uid },
    {
      $unset: { tokenquenmatkhau: '', thoigianhethan: '' },
      $set: { ngaycapnhat: new Date() }
    }
  );
}

module.exports = {
  ensureAccountFromUser,
  createLocalAccountForUser,
  getProfilePageData,
  updateUserProfile,
  changeUserPassword,
  softDeleteUserAccount,
  hasLocalPassword,
  getAccountByUserId,
  findAccountByEmail,
  verifyPasswordByEmail,
  verifyPasswordWithLegacy,
  setPasswordByUserId,
  syncRoleStatusFromUser,
  createPasswordResetToken,
  findAccountByResetToken,
  clearPasswordResetTokenByUserId
};

