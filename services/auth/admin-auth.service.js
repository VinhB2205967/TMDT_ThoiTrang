const nguoidung = require('../../models/user_model');
const { writeLoginLog } = require('../loginLog');
const { verifyPasswordWithLegacy, getAccountByUserId } = require('../account/index.js');

function chuanHoaEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function taoKetQua({ ok, status, code, message, user }) {
  return { ok, status, code, message, user };
}

async function xacThucDangNhapAdmin({ req, email, password }) {
  const emaildangnhap = chuanHoaEmail(email);
  const matkhau = String(password || '');

  if (!emaildangnhap || !matkhau) {
    await writeLoginLog({ req, email: emaildangnhap, provider: 'admin', status: 'failed', message: 'missing_credentials' });
    return taoKetQua({ ok: false, status: 400, code: 'MISSING_CREDENTIALS', message: 'Vui lòng nhập email và mật khẩu' });
  }

  const taikhoan = await nguoidung.findOne({ email: emaildangnhap, daxoa: { $ne: true } });
  if (!taikhoan) {
    await writeLoginLog({ req, email: emaildangnhap, provider: 'admin', status: 'failed', message: 'user_not_found' });
    return taoKetQua({ ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Sai email hoặc mật khẩu' });
  }

  const hople = await verifyPasswordWithLegacy({ userDoc: taikhoan, passwordPlain: matkhau });
  if (!hople) {
    await writeLoginLog({ req, user: taikhoan, provider: 'admin', status: 'failed', message: 'wrong_password' });
    return taoKetQua({ ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Sai email hoặc mật khẩu' });
  }

  const acc = await getAccountByUserId({ userId: taikhoan._id }).catch(() => null);
  if (!acc || acc.trangthai !== 'active') {
    await writeLoginLog({ req, user: taikhoan, provider: 'admin', status: 'failed', message: 'noactive' });
    return taoKetQua({ ok: false, status: 403, code: 'ACCOUNT_INACTIVE', message: 'Tài khoản đang bị khóa' });
  }

  if (acc.vaitro !== 'admin') {
    await writeLoginLog({ req, user: taikhoan, provider: 'admin', status: 'failed', message: 'not_admin' });
    return taoKetQua({ ok: false, status: 403, code: 'FORBIDDEN', message: 'Tài khoản này không có quyền Admin' });
  }

  await nguoidung.updateOne(
    { _id: taikhoan._id },
    {
      $set: {
        lastLoginAt: new Date(),
        lastLoginProvider: 'admin',
        lastLoginIp: req.ip,
        lastLoginUserAgent: String(req.headers['user-agent'] || ''),
        lastSeenAt: new Date()
      }
    }
  );

  await writeLoginLog({ req, user: taikhoan, provider: 'admin', status: 'success' });
  return taoKetQua({ ok: true, status: 200, message: 'Đăng nhập Admin thành công', user: taikhoan });
}

function luuSessionAdmin(req, user) {
  req.session.adminUserId = String(user._id);
}

async function danhDauOfflineAdmin({ userId }) {
  const idadmin = userId ? String(userId) : null;
  if (!idadmin) return;

  const onlinewindowms = 5 * 60 * 1000;
  const thoidiemoffline = new Date(Date.now() - onlinewindowms - 1000);
  await nguoidung.updateOne(
    { _id: idadmin, daxoa: { $ne: true } },
    { $set: { lastSeenAt: thoidiemoffline } }
  ).catch(() => {});
}

function xoaSessionAdmin(req) {
  if (req.session) delete req.session.adminUserId;
}

module.exports = {
  chuanHoaEmail,
  xacThucDangNhapAdmin,
  luuSessionAdmin,
  danhDauOfflineAdmin,
  xoaSessionAdmin
};
