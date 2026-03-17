require('dotenv').config();
const mongoose = require('mongoose');

const database = require('../config/database');
const Nguoidung = require('../models/user_model');
const { createLocalAccountForUser, setPasswordByUserId, ensureAccountFromUser } = require('../services/account.service');

const DEFAULT_PASSWORD = '123456';
const USER_TOTAL = 30;

function pad2(num) {
  return String(num).padStart(2, '0');
}

function buildSeedUsers() {
  const users = [];
  for (let i = 1; i <= USER_TOTAL; i += 1) {
    const index = pad2(i);
    users.push({
      hoten: `Khach Hang ${index}`,
      email: `user${index}@fashion.local`,
      sodienthoai: `0900000${String(i).padStart(3, '0')}`,
      diachi: `Dia chi mau so ${index}`,
      gioitinh: i % 3 === 0 ? 'nu' : i % 3 === 1 ? 'nam' : 'unisex'
    });
  }
  return users;
}

async function ensureOneUser(profile) {
  const email = String(profile.email || '').trim().toLowerCase();
  const now = new Date();

  let user = await Nguoidung.findOne({ email }).lean();
  if (!user) {
    const created = await Nguoidung.create({
      hoten: profile.hoten,
      email,
      sodienthoai: profile.sodienthoai,
      diachi: profile.diachi,
      gioitinh: profile.gioitinh,
      daxoa: false,
      ngaytao: now,
      ngaycapnhat: now
    });

    await createLocalAccountForUser({
      userDoc: created,
      passwordPlain: DEFAULT_PASSWORD,
      overrides: { vaitro: 'user', trangthai: 'active', xacthuc: true }
    });

    return { created: 1, updated: 0 };
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

  await ensureAccountFromUser(
    {
      _id: user._id,
      email,
      vaitro: 'user',
      trangthai: 'active',
      xacthuc: true
    },
    {
      provider: 'local',
      overrides: { vaitro: 'user', trangthai: 'active', xacthuc: true }
    }
  );

  await setPasswordByUserId({ userId: user._id, newPasswordPlain: DEFAULT_PASSWORD });

  return { created: 0, updated: 1 };
}

async function run() {
  await database.connect();

  const profiles = buildSeedUsers();
  let created = 0;
  let updated = 0;

  for (const profile of profiles) {
    const result = await ensureOneUser(profile);
    created += result.created;
    updated += result.updated;
  }

  console.log(`Seed users done. Created: ${created}, Updated: ${updated}, Total target: ${USER_TOTAL}`);
  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('Seed users failed:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
