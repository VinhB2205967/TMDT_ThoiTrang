require('dotenv').config();
const mongoose = require('mongoose');

const database = require('../config/database');
const Nguoidung = require('../models/user_model');
const { taoTKLocal, damBaoTK, datMKTheoId } = require('../services/account/index.js');

const DEFAULT_PASSWORD = '123456';
const USER_TOTAL = 20;
const ADMIN_TOTAL = 5;

function pad2(num) {
  return String(num).padStart(2, '0');
}

function buildProfiles() {
  const profiles = [];

  for (let i = 1; i <= USER_TOTAL; i += 1) {
    const index = pad2(i);
    profiles.push({
      hoten: `User ${index}`,
      email: `user${index}@gmail.com`,
      sodienthoai: `0910000${String(i).padStart(3, '0')}`,
      diachi: `Dia chi user ${index}`,
      gioitinh: i % 2 === 0 ? 'nu' : 'nam',
      role: 'user'
    });
  }

  for (let i = 1; i <= ADMIN_TOTAL; i += 1) {
    const index = pad2(i);
    profiles.push({
      hoten: `Admin ${index}`,
      email: `admin${index}@gmail.com`,
      sodienthoai: `0920000${String(i).padStart(3, '0')}`,
      diachi: `Dia chi admin ${index}`,
      gioitinh: i % 2 === 0 ? 'nu' : 'nam',
      role: 'admin'
    });
  }

  return profiles;
}

async function ensureOneAccount(profile) {
  const email = String(profile.email || '').trim().toLowerCase();
  const now = new Date();

  let user = await Nguoidung.findOne({ email });

  if (!user) {
    user = await Nguoidung.create({
      hoten: profile.hoten,
      email,
      sodienthoai: profile.sodienthoai,
      diachi: profile.diachi,
      gioitinh: profile.gioitinh,
      daxoa: false,
      ngaytao: now,
      ngaycapnhat: now
    });

    await taoTKLocal({
      userDoc: user,
      passwordPlain: DEFAULT_PASSWORD,
      overrides: { vaitro: profile.role, trangthai: 'active', xacthuc: true }
    });

    return { created: 1, updated: 0, role: profile.role, email };
  }

  await Nguoidung.updateOne(
    { _id: user._id },
    {
      $set: {
        hoten: profile.hoten,
        sodienthoai: profile.sodienthoai,
        diachi: profile.diachi,
        gioitinh: profile.gioitinh,
        daxoa: false,
        ngaycapnhat: now
      }
    }
  );

  await damBaoTK(
    {
      _id: user._id,
      email,
      vaitro: profile.role,
      trangthai: 'active',
      xacthuc: true
    },
    {
      provider: 'local',
      overrides: { vaitro: profile.role, trangthai: 'active', xacthuc: true }
    }
  );

  await datMKTheoId({ userId: user._id, newPasswordPlain: DEFAULT_PASSWORD });

  return { created: 0, updated: 1, role: profile.role, email };
}

async function run() {
  await database.connect();

  const profiles = buildProfiles();
  let created = 0;
  let updated = 0;
  let createdUsers = 0;
  let createdAdmins = 0;
  let updatedUsers = 0;
  let updatedAdmins = 0;

  for (const profile of profiles) {
    const result = await ensureOneAccount(profile);
    created += result.created;
    updated += result.updated;

    if (result.role === 'admin') {
      createdAdmins += result.created;
      updatedAdmins += result.updated;
    } else {
      createdUsers += result.created;
      updatedUsers += result.updated;
    }
  }

  console.log(`Seed auth demo accounts done. Created: ${created}, Updated: ${updated}`);
  console.log(`Users -> created: ${createdUsers}, updated: ${updatedUsers}, target: ${USER_TOTAL}`);
  console.log(`Admins -> created: ${createdAdmins}, updated: ${updatedAdmins}, target: ${ADMIN_TOTAL}`);
  console.log(`Default password for all seeded accounts: ${DEFAULT_PASSWORD}`);

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('Seed auth demo accounts failed:', err);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
