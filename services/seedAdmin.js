const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Nguoidung = require('../models/user_model');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureAdminUser() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@fashion.local');
  const password = String(process.env.ADMIN_PASSWORD || 'Admin@123');

  // Normalize legacy status values to the new set: active/noactive
  // (keeps DB consistent with code expectations)
  await Nguoidung.updateMany(
    { trangthai: { $in: ['hoatdong', 'hoạt động'] } },
    { $set: { trangthai: 'active' } }
  ).catch(() => {});
  await Nguoidung.updateMany(
    { trangthai: { $in: ['blocked', 'inactive'] } },
    { $set: { trangthai: 'noactive' } }
  ).catch(() => {});

  const existing = {
    email,
    daxoa: { $ne: true }
  };

  let user = await Nguoidung.findOne(existing);
  const matkhau = await bcrypt.hash(password, 10);

  if (!user) {
    await Nguoidung.create({
      hoten: 'Admin',
      email,
      matkhau,
      vaitro: 'admin',
      trangthai: 'active',
      xacthuc: true,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[seedAdmin] Created admin user: ${email}`);
      console.log(`[seedAdmin] Admin password: ${password}`);
    }
    return;
  }

  // Nếu user đã tồn tại nhưng chưa phải admin thì nâng quyền + cập nhật mật khẩu theo env
  let changed = false;
  if (user.vaitro !== 'admin') {
    user.vaitro = 'admin';
    changed = true;
  }
  if (password) {
    user.matkhau = matkhau;
    changed = true;
  }
  if (user.trangthai !== 'active') {
    user.trangthai = 'active';
    changed = true;
  }
  if (!user.xacthuc) {
    user.xacthuc = true;
    changed = true;
  }

  if (changed) {
    user.ngaycapnhat = new Date();
    await user.save();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[seedAdmin] Ensured admin role for: ${email}`);
    }
  }
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
