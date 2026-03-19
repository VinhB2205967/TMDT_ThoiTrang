const mongoose = require('mongoose');
const Nguoidung = require('../models/user_model');
const { createLocalAccountForUser, ensureAccountFromUser, setPasswordByUserId } = require('./account/index.js');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isSeedAdminVerbose() {
  return String(process.env.SEED_ADMIN_VERBOSE || '').trim() === '1';
}

function canLogSeedAdmin() {
  return process.env.NODE_ENV !== 'production' && isSeedAdminVerbose();
}

function canLogSeedAdminCredentials() {
  return canLogSeedAdmin() && String(process.env.SEED_ADMIN_LOG_CREDENTIALS || '').trim() === '1';
}

async function ensureAdminUser() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@fashion.local');
  const password = String(process.env.ADMIN_PASSWORD || 'Admin@123');

  const existing = {
    email,
    daxoa: { $ne: true }
  };

  let user = await Nguoidung.findOne(existing);
  if (!user) {
    const created = await Nguoidung.create({
      hoten: 'Admin',
      email,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    await createLocalAccountForUser({
      userDoc: created,
      passwordPlain: password,
      overrides: { vaitro: 'admin', trangthai: 'active', xacthuc: true }
    });

    void created;

    if (canLogSeedAdmin()) console.log('[seedAdmin] Created admin user');
    if (canLogSeedAdminCredentials()) console.log(`[seedAdmin] Admin password: ${password}`);
    return;
  }

  // Nếu user đã tồn tại nhưng chưa phải admin thì nâng quyền + cập nhật mật khẩu theo env
  // Ensure account is admin/active/verified and password matches env.
  await ensureAccountFromUser(user, {
    provider: 'local',
    overrides: { vaitro: 'admin', trangthai: 'active', xacthuc: true }
  });
  if (password) {
    await setPasswordByUserId({ userId: user._id, newPasswordPlain: password });
  }
  await Nguoidung.updateOne({ _id: user._id }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});

  // Intentionally avoid logging emails by default.
  if (canLogSeedAdmin()) console.log('[seedAdmin] Ensured admin role');
}

function seedAdminOnConnect() {
  if (mongoose.connection.readyState === 1) {
    ensureAdminUser().catch(err => console.error('[seedAdmin] Error:', err));
    return;
  }

  mongoose.connection.once('connected', () => {
    ensureAdminUser().catch(err => console.error('[seedAdmin] Error:', err));
  });
}

module.exports = {
  seedAdminOnConnect
};
