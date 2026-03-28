const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const Taikhoan = require('../../models/accounts_model');
const Nguoidung = require('../../models/user_model');
const { chuanHoaSoDienThoai, laSoDienThoaiVN } = require('../../helpers/validators');
// Các hàm tiện ích
function chuanEmail(email) {
  return String(email || '').trim().toLowerCase();
}
// Các hàm tiện ích khác có thể thêm ở đây
function chuanId(id) {
  return id ? String(id) : null;
}

function chuanVaiTro(vaitro) {
  const r = String(vaitro || '').trim();
  return r === 'admin' ? 'admin' : 'user';
}

function chuanTrangThai(trangthai) {
  const s = String(trangthai || '').trim();
  return s === 'noactive' ? 'noactive' : 'active';
}

function chuanChuoi(value) {
  return String(value || '').trim();
}

function taoIdHienThiNguoiDung({ userId, createdAt } = {}) {
  const uid = chuanId(userId);
  if (!uid) return '';

  const created = new Date(createdAt || Date.now());
  const hopLeNgay = !Number.isNaN(created.getTime());
  const ngay = hopLeNgay
    ? `${String(created.getFullYear()).slice(-2)}${String(created.getMonth() + 1).padStart(2, '0')}${String(created.getDate()).padStart(2, '0')}`
    : '000000';

  const maRutGon = crypto
    .createHash('sha1')
    .update(uid)
    .digest('base64url')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  return `ND-${ngay}-${maRutGon || 'UNKNOWN'}`;
}
// Hàm tiện ích để chuẩn hóa mã voucher (chỉ giữ chữ và số, viết hoa)
function dinhDangNgay(d) {
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
// Hàm tiện ích để chuẩn hóa mã voucher (chỉ giữ chữ và số, viết hoa)
function kiemTraMKMoi(password) {
  const p = String(password || '');
  if (p.length < 6) return 'Mật khẩu phải tối thiểu 6 ký tự';
  return null;
}

function taoLoi(message, code = 'BUSINESS_ERROR') {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function layAuthCu(userId) {
  const uid = chuanId(userId);
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
// Các hàm dịch vụ chính
async function damBaoTK(userDoc, { provider, overrides } = {}) {
  if (!userDoc || !userDoc._id) throw new Error('Thiáº¿u user');

  const uid = chuanId(userDoc._id);
  const email = chuanEmail(userDoc.email);
  const now = new Date();

  const ov = overrides || {};

  await Taikhoan.updateOne(
    { nguoidung_id: uid },
    {
      $set: {
        email,
        provider: provider || 'local',
        vaitro: chuanVaiTro(ov.vaitro ?? userDoc.vaitro ?? 'user'),
        trangthai: chuanTrangThai(ov.trangthai ?? userDoc.trangthai ?? 'active'),
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
// Hàm tạo tài khoản local cho user (dùng khi đăng ký bằng email/mật khẩu hoặc khi user cũ đăng nhập bằng mật khẩu cũ)
async function taoTKLocal({ userDoc, passwordPlain, overrides } = {}) {
  if (!userDoc || !userDoc._id) throw new Error('Thiếu user');
  const uid = chuanId(userDoc._id);
  const email = chuanEmail(userDoc.email);

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
        vaitro: chuanVaiTro(ov.vaitro ?? userDoc.vaitro ?? 'user'),
        trangthai: chuanTrangThai(ov.trangthai ?? userDoc.trangthai ?? 'active'),
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

async function timTKTheoEmail(email) {
  const e = chuanEmail(email);
  if (!e) return null;
  return Taikhoan.findOne({ email: e }).lean();
}

async function layTKTheoId({ userId }) {
  const uid = chuanId(userId);
  if (!uid) return null;
  return Taikhoan.findOne({ nguoidung_id: uid }).select('-matkhau').lean();
}

async function coMKLocal({ userId }) {
  const uid = chuanId(userId);
  if (!uid) return false;

  const account = await Taikhoan.findOne({ nguoidung_id: uid }).select('matkhau').lean();
  if (account && String(account.matkhau || '').trim()) return true;

  const legacy = await layAuthCu(uid);
  return Boolean(String(legacy?.matkhau || '').trim());
}

async function layDuLieuHoSo({ userId, fallbackUser } = {}) {
  const uid = chuanId(userId || fallbackUser?._id);
  const profileUser = fallbackUser || {};
  const idHienThi = taoIdHienThiNguoiDung({
    userId: uid,
    createdAt: profileUser?.ngaytao || profileUser?.createdAt
  });

  let coMatKhau = Boolean(profileUser?.matkhau);
  let loaiTaiKhoan = 'local';

  if (uid) {
    const account = await layTKTheoId({ userId: uid });
    if (account && account.provider) loaiTaiKhoan = String(account.provider);
    coMatKhau = await coMKLocal({ userId: uid });
  }

  return {
    profile: {
      userid: uid || '',
      idhienthi: idHienThi || '',
      hoten: profileUser?.hoten || '',
      email: profileUser?.email || '',
      sodienthoai: profileUser?.sodienthoai || '',
      diachi: profileUser?.diachi || '',
      gioitinh: profileUser?.gioitinh || '',
      ngaysinh: dinhDangNgay(profileUser?.ngaysinh),
      avatar: profileUser?.avatar || ''
    },
    hasPassword: coMatKhau,
    canChangePassword: loaiTaiKhoan !== 'google'
  };
}

async function capNhatHoSo({ userId, payload, fileUpload, currentAvatar } = {}) {
  const uid = chuanId(userId);
  if (!uid) throw taoLoi('Vui lòng đăng nhập lại', 'AUTH_REQUIRED');

  const hoten = chuanChuoi(payload?.hoten);
  const sdtraw = chuanChuoi(payload?.sodienthoai);
  if (sdtraw && !laSoDienThoaiVN(sdtraw)) {
    throw taoLoi('Số điện thoại không đúng định dạng', 'INVALID_PHONE');
  }

  const sodienthoai = sdtraw ? chuanHoaSoDienThoai(sdtraw) : '';
  const diachi = chuanChuoi(payload?.diachi);
  const gioitinh = chuanChuoi(payload?.gioitinh);

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

async function doiMK({ userId, oldPassword, newPassword, confirmPassword } = {}) {
  const uid = chuanId(userId);
  if (!uid) throw taoLoi('Vui lòng đăng nhập lại', 'AUTH_REQUIRED');

  const account = await layTKTheoId({ userId: uid });
  if (account && String(account.provider || '') === 'google') {
    throw taoLoi('Tài khoản Google không hỗ trợ đổi mật khẩu tại đây', 'GOOGLE_ACCOUNT');
  }

  const matkhaucu = String(oldPassword || '');
  const matkhaumoi = String(newPassword || '');
  const xacnhanmatkhau = String(confirmPassword || '');

  const loimatkhau = kiemTraMKMoi(matkhaumoi);
  if (loimatkhau) throw taoLoi(loimatkhau, 'INVALID_PASSWORD');

  if (matkhaumoi !== xacnhanmatkhau) {
    throw taoLoi('Xác nhận mật khẩu không khớp', 'PASSWORD_CONFIRM_MISMATCH');
  }

  const taikhoan = await Nguoidung.findOne({ _id: uid, daxoa: { $ne: true } });
  if (!taikhoan) throw taoLoi('Không tìm thấy tài khoản', 'ACCOUNT_NOT_FOUND');

  const daCoMatKhau = (await coMKLocal({ userId: uid })) || Boolean(taikhoan.matkhau);
  if (daCoMatKhau) {
    const hople = await xacThucKieuCu({ userDoc: taikhoan, passwordPlain: matkhaucu });
    if (!hople) throw taoLoi('Mật khẩu hiện tại không đúng', 'OLD_PASSWORD_INVALID');
  }

  await datMKTheoId({ userId: uid, newPasswordPlain: matkhaumoi });
  await Nguoidung.updateOne(
    { _id: uid, daxoa: { $ne: true } },
    { $set: { ngaycapnhat: new Date() } }
  );

  return true;
}

async function xoaMemTK({ userId } = {}) {
  const uid = chuanId(userId);
  if (!uid) throw taoLoi('Vui lòng đăng nhập lại', 'AUTH_REQUIRED');

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

async function xacThucTheoEmail({ email, passwordPlain }) {
  const acc = await timTKTheoEmail(email);
  if (!acc) return { ok: false, userId: null, account: null };

  const password = String(passwordPlain || '');
  const hash = String(acc.matkhau || '');
  if (!hash) return { ok: false, userId: String(acc.nguoidung_id), account: acc };

  const ok = await bcrypt.compare(password, hash);
  return { ok, userId: String(acc.nguoidung_id), account: acc };
}

// Kh cần script: user cũ đăng nhập bằng users.matkhau sẽ tự tạo record accounts.
async function xacThucKieuCu({ userDoc, passwordPlain }) {
  if (!userDoc || !userDoc._id) return false;

  const uid = chuanId(userDoc._id);
  const email = chuanEmail(userDoc.email);
  const password = String(passwordPlain || '');

  const acc = await Taikhoan.findOne({ nguoidung_id: uid }).lean();
  if (acc && acc.matkhau) {
    return bcrypt.compare(password, String(acc.matkhau || ''));
  }

  // legacy auth fields may no longer be in the Mongoose schema -> read raw from collection
  const legacy = await layAuthCu(uid);
  let legacyHash = String(legacy?.matkhau || '');
  if (!legacyHash) return false;

  const ok = await bcrypt.compare(password, legacyHash);
  if (!ok) return false;

  const now = new Date();
  await Taikhoan.updateOne(
    { nguoidung_id: uid },
    {
      $set: {
        email: email || chuanEmail(legacy?.email),
        matkhau: legacyHash,
        provider: 'local',
        vaitro: chuanVaiTro(legacy?.vaitro ?? userDoc.vaitro ?? 'user'),
        trangthai: chuanTrangThai(legacy?.trangthai ?? userDoc.trangthai ?? 'active'),
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

async function datMKTheoId({ userId, newPasswordPlain }) {
  const uid = chuanId(userId);
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

async function dongBoVaiTro({ userId, vaitro, trangthai }) {
  const uid = chuanId(userId);
  if (!uid) return;

  const $set = { ngaycapnhat: new Date() };
  if (vaitro) $set.vaitro = vaitro;
  if (trangthai) $set.trangthai = trangthai;

  await Taikhoan.updateOne({ nguoidung_id: uid }, { $set }, { upsert: true }).catch(() => {});
}

function bamTokenReset(tokenPlain) {
  return crypto.createHash('sha256').update(String(tokenPlain || '')).digest('hex');
}

async function taoTokenReset({ userId, expiresMinutes = 15 }) {
  const uid = chuanId(userId);
  if (!uid) throw new Error('Thiáº¿u userId');

  const minutes = Math.max(1, Number(expiresMinutes || 15));
  const tokenPlain = crypto.randomBytes(32).toString('hex');
  const tokenHash = bamTokenReset(tokenPlain);
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

async function timTKTheoToken({ tokenPlain }) {
  const token = String(tokenPlain || '').trim();
  if (!token) return null;

  const tokenHash = bamTokenReset(token);
  const now = new Date();
  const account = await Taikhoan.findOne({
    tokenquenmatkhau: tokenHash,
    thoigianhethan: { $gt: now }
  }).lean();

  return account || null;
}

async function xoaTokenTheoId({ userId }) {
  const uid = chuanId(userId);
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
  damBaoTK,
  taoTKLocal,
  layDuLieuHoSo,
  capNhatHoSo,
  doiMK,
  xoaMemTK,
  coMKLocal,
  layTKTheoId,
  timTKTheoEmail,
  xacThucTheoEmail,
  xacThucKieuCu,
  datMKTheoId,
  dongBoVaiTro,
  taoTokenReset,
  timTKTheoToken,
  xoaTokenTheoId
};



