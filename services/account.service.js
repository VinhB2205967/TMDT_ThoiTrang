const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Taikhoan = require('../models/accounts_model');
const Nguoidung = require('../models/user_model');

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
  if (!userDoc || !userDoc._id) throw new Error('Thiếu user');

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
  if (!userDoc || !userDoc._id) throw new Error('Thiếu user');
  const uid = normalizeId(userDoc._id);
  const email = normalizeEmail(userDoc.email);

  const password = String(passwordPlain || '');
  if (password.length < 6) throw new Error('Mật khẩu phải tối thiểu 6 ký tự');

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

async function verifyPasswordByEmail({ email, passwordPlain }) {
  const acc = await findAccountByEmail(email);
  if (!acc) return { ok: false, userId: null, account: null };

  const password = String(passwordPlain || '');
  const hash = String(acc.matkhau || '');
  if (!hash) return { ok: false, userId: String(acc.nguoidung_id), account: acc };

  const ok = await bcrypt.compare(password, hash);
  return { ok, userId: String(acc.nguoidung_id), account: acc };
}

// Không cần script: user cũ đăng nhập bằng users.matkhau sẽ tự tạo record accounts.
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
  if (!uid) throw new Error('Thiếu userId');

  const password = String(newPasswordPlain || '');
  if (password.length < 6) throw new Error('Mật khẩu phải tối thiểu 6 ký tự');

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
  if (!uid) throw new Error('Thiếu userId');

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
