const mongoose = require('mongoose');
const Nguoidung = require('../../models/user_model');
const Taikhoan = require('../../models/accounts_model');
const paginationHelper = require('../../helpers/pagination');
const {
  thoatBieuThuc,
  chuanHoaSoDienThoai,
  laSoDienThoaiVN
} = require('../../helpers/validators');
const { setPasswordByUserId, syncRoleStatusFromUser } = require('./index.js');

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_USERS_URL = '/admin/users';
// Các hàm tiện ích

function chuanHoaTuKhoa(tukhoa) {
  const k = String(tukhoa || '').trim();
  if (!k) return '';
  return thoatBieuThuc(k.slice(0, 100));
}


function dangOnline(lastseenat, windowms = ONLINE_WINDOW_MS) {
  if (!lastseenat) return false;
  const t = new Date(lastseenat).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= windowms;
}

function sapXepOnlineTruoc(a, b) {
  const ao = a && a.isOnline ? 1 : 0;
  const bo = b && b.isOnline ? 1 : 0;
  if (ao !== bo) return bo - ao;

  const at = a && a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
  const bt = b && b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
  const atn = Number.isFinite(at) ? at : 0;
  const btn = Number.isFinite(bt) ? bt : 0;
  if (atn !== btn) return btn - atn;

  const ac = a && (a.ngaytao || a.createdAt) ? new Date(a.ngaytao || a.createdAt).getTime() : 0;
  const bc = b && (b.ngaytao || b.createdAt) ? new Date(b.ngaytao || b.createdAt).getTime() : 0;
  const acn = Number.isFinite(ac) ? ac : 0;
  const bcn = Number.isFinite(bc) ? bc : 0;
  return bcn - acn;
}


function chuanHoaChuoi(value) {
  return String(value || '').trim();
}


function phanTichNgayTuyChon(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}


function batDauNgay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}


function laNgayTrongTuongLai(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return false;
  return batDauNgay(date).getTime() > batDauNgay(new Date()).getTime();
}


function taoBoLocNguoiDung({ keyword: tukhoa, online, deleted }) {
  const boloc =
    deleted === '1' ? { daxoa: true }
      : deleted === 'all' ? {}
        : { daxoa: { $ne: true } };

  const dieukienva = [];
  if (tukhoa) {
    dieukienva.push({
      $or: [
        { email: { $regex: tukhoa, $options: 'i' } },
        { hoten: { $regex: tukhoa, $options: 'i' } }
      ]
    });
  }

  const mocthoigian = new Date(Date.now() - ONLINE_WINDOW_MS);
  if (online === '1') {
    boloc.lastSeenAt = { $gte: mocthoigian };
  } else if (online === '0') {
    dieukienva.push({
      $or: [
        { lastSeenAt: { $lt: mocthoigian } },
        { lastSeenAt: { $exists: false } },
        { lastSeenAt: null }
      ]
    });
  }

  if (dieukienva.length) boloc.$and = dieukienva;
  return boloc;
}


async function taoBoLocNguoiDungTheoAccount({ vaitro, trangthai }) {
  const boloc = {};
  if (vaitro === 'admin' || vaitro === 'user') boloc.vaitro = vaitro;
  if (trangthai === 'active' || trangthai === 'noactive') boloc.trangthai = trangthai;
  if (!Object.keys(boloc).length) return null;

  const ids = await Taikhoan.find(boloc).select('nguoidung_id').lean();
  const userIds = ids.map((r) => r.nguoidung_id).filter(Boolean);
  if (!userIds.length) return { _id: { $in: [] } };
  return { _id: { $in: userIds } };
}


async function ganThongTinAccount(users) {
  const userIds = users.map((u) => u && u._id).filter(Boolean);
  if (!userIds.length) return users;

  const accounts = await Taikhoan.find({ nguoidung_id: { $in: userIds } })
    .select('nguoidung_id email provider vaitro trangthai xacthuc')
    .lean();

  const map = new Map(accounts.map((a) => [String(a.nguoidung_id), a]));
  return users.map((u) => {
    const acc = map.get(String(u._id));
    return {
      ...u,
      account: acc || null,
      vaitro: acc?.vaitro || u.vaitro,
      trangthai: acc?.trangthai || u.trangthai,
      xacthuc: typeof acc?.xacthuc === 'boolean' ? acc.xacthuc : u.xacthuc
    };
  });
}


function taoChuoiBoLoc({ vaitro, trangthai, online, deleted, limit }) {
  let s = '';
  if (vaitro) s += `&vaitro=${encodeURIComponent(vaitro)}`;
  if (trangthai) s += `&trangthai=${encodeURIComponent(trangthai)}`;
  if (online) s += `&online=${encodeURIComponent(online)}`;
  if (deleted) s += `&deleted=${encodeURIComponent(deleted)}`;
  if (limit) s += `&limit=${encodeURIComponent(limit)}`;
  return s;
}


function quayLaiChiTietHoacDanhSach(referer, userid) {
  const ref = String(referer || '');
  if (ref.includes(`/admin/users/${userid}`)) return `/admin/users/${userid}`;
  return DEFAULT_USERS_URL;
}

function layDuongDanDanhSachMacDinh() {
  return DEFAULT_USERS_URL;
}


function xacDinhLoaiFlashKetQua(result) {
  return result && result.ok ? 'success' : 'error';
}


function getDanhSachFallbackData() {
  return {
    titlePage: 'Quản lý người dùng',
    users: [],
    filters: { keyword: '', vaitro: '', trangthai: '', online: '', deleted: '', limit: 10 },
    pagination: { currentPage: 1, limit: 10, skip: 0, totalPages: 0, totalProducts: 0 },
    filterString: ''
  };
}

async function getDanhSachData(query = {}) {
  const tukhoa = chuanHoaTuKhoa(query.keyword);
  const vaitro = String(query.vaitro || '').trim();
  const trangthai = String(query.trangthai || '').trim();
  const online = String(query.online || '').trim();
  const daxoa = String(query.deleted || '').trim();
  const limitRaw = parseInt(query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(5, limitRaw)) : 10;

  let phantrang = {
    currentPage: 1,
    limit
  };

  const dieukien = taoBoLocNguoiDung({ keyword: tukhoa, vaitro, trangthai, online, deleted: daxoa });
  const themDieuKienTheoAccount = await taoBoLocNguoiDungTheoAccount({ vaitro, trangthai });
  if (themDieuKienTheoAccount) {
    if (dieukien.$and) dieukien.$and.push(themDieuKienTheoAccount);
    else dieukien.$and = [themDieuKienTheoAccount];
  }

  const tongnguoidung = await Nguoidung.countDocuments(dieukien);
  phantrang = paginationHelper(phantrang, query, tongnguoidung);

  const danhsachnguoidung = await Nguoidung.find(dieukien)
    .sort({ lastSeenAt: -1, ngaytao: -1 })
    .skip(phantrang.skip)
    .limit(phantrang.limit)
    .lean();

  const daGanAccount = await ganThongTinAccount(danhsachnguoidung);
  const nguoidungdaxuly = daGanAccount.map((u) => ({
    ...u,
    isOnline: dangOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
  })).sort(sapXepOnlineTruoc);

  const chuoiboloc = taoChuoiBoLoc({ vaitro, trangthai, online, deleted: daxoa, limit });

  return {
    titlePage: 'Quản lý người dùng',
    users: nguoidungdaxuly,
    filters: { keyword: tukhoa, vaitro, trangthai, online, deleted: daxoa, limit },
    pagination: phantrang,
    filterString: chuoiboloc
  };
}


async function getChiTietData(id) {
  const userid = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(userid)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  const taikhoan = await Nguoidung.findById(userid).lean();
  if (!taikhoan) {
    return { ok: false, message: 'Không tìm thấy người dùng', redirect: DEFAULT_USERS_URL };
  }

  const [taikhoandagan] = await ganThongTinAccount([taikhoan]);

  const taikhoandaxuly = {
    ...taikhoandagan,
    isOnline: dangOnline(taikhoandagan.lastSeenAt, ONLINE_WINDOW_MS)
  };

  return {
    ok: true,
    data: {
      titlePage: 'Chi tiết tài khoản',
      u: taikhoandaxuly
    }
  };
}


async function getAnhChupOnlineData(query = {}) {
  const tukhoa = chuanHoaTuKhoa(query.keyword);
  const vaitro = String(query.vaitro || '').trim();
  const trangthai = String(query.trangthai || '').trim();
  const online = String(query.online || '').trim();
  const daxoa = String(query.deleted || '').trim();

  let phantrang = {
    currentPage: 1,
    limit: 10
  };

  const dieukien = taoBoLocNguoiDung({ keyword: tukhoa, vaitro, trangthai, online, deleted: daxoa });
  const themDieuKienTheoAccount = await taoBoLocNguoiDungTheoAccount({ vaitro, trangthai });
  if (themDieuKienTheoAccount) {
    if (dieukien.$and) dieukien.$and.push(themDieuKienTheoAccount);
    else dieukien.$and = [themDieuKienTheoAccount];
  }

  const tongnguoidung = await Nguoidung.countDocuments(dieukien);
  phantrang = paginationHelper(phantrang, query, tongnguoidung);

  const danhsachnguoidung = await Nguoidung.find(dieukien)
    .select({ _id: 1, lastSeenAt: 1 })
    .sort({ lastSeenAt: -1, ngaytao: -1 })
    .skip(phantrang.skip)
    .limit(phantrang.limit)
    .lean();

  const anhchup = danhsachnguoidung.map((u) => {
    const onlinenow = dangOnline(u.lastSeenAt, ONLINE_WINDOW_MS);
    return {
      id: String(u._id),
      isOnline: onlinenow,
      lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null
    };
  }).sort(sapXepOnlineTruoc);

  return {
    now: new Date().toISOString(),
    users: anhchup
  };
}

async function capNhatVaiTro(userId, vaitro) {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  const role = String(vaitro || '').trim();
  if (role !== 'admin' && role !== 'user') {
    return { ok: false, message: 'Vai trò không hợp lệ  ', redirect: DEFAULT_USERS_URL };
  }

  await syncRoleStatusFromUser({ userId: id, vaitro: role });
  await Nguoidung.updateOne({ _id: id, daxoa: { $ne: true } }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
  return { ok: true, message: 'Cập nhật vai trò thành công', redirect: DEFAULT_USERS_URL };
}

async function capNhatTrangThai(userId, trangthai) {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  const status = String(trangthai || '').trim();
  if (status !== 'active' && status !== 'noactive') {
    return { ok: false, message: 'Trạng thái không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  await syncRoleStatusFromUser({ userId: id, trangthai: status });
  await Nguoidung.updateOne({ _id: id, daxoa: { $ne: true } }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
  return { ok: true, message: 'Cập nhật trạng thái thành công', redirect: DEFAULT_USERS_URL };
}


async function xoaMem(userId) {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  await Nguoidung.updateOne(
    { _id: id, daxoa: { $ne: true } },
    { $set: { daxoa: true, ngaycapnhat: new Date() } }
  );

  return { ok: true, message: 'Đã xóa (mềm) tài khoản', redirect: DEFAULT_USERS_URL };
}


async function capNhatTuChiTiet({ userId, body, referer }) {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  const hoten = chuanHoaChuoi(body.hoten);
  const rawphone = chuanHoaChuoi(body.sodienthoai);
  const sodienthoai = rawphone ? chuanHoaSoDienThoai(rawphone) : '';
  const diachi = chuanHoaChuoi(body.diachi);
  const gioitinh = chuanHoaChuoi(body.gioitinh);
  const ngaysinhRaw = chuanHoaChuoi(body.ngaysinh);
  const ngaysinh = phanTichNgayTuyChon(ngaysinhRaw);

  const vaitro = chuanHoaChuoi(body.vaitro);
  const trangthai = chuanHoaChuoi(body.trangthai);

  if (rawphone && !laSoDienThoaiVN(rawphone)) {
    return { ok: false, message: 'Số điện thoại không đúng định dạng', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
  }
  if (ngaysinhRaw && !ngaysinh) {
    return { ok: false, message: 'Ngày sinh không hợp lệ', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
  }

  if (ngaysinh && laNgayTrongTuongLai(ngaysinh)) {
    return { ok: false, message: 'Ngày sinh không được vượt quá ngày hiện tại', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
  }

  if (vaitro && vaitro !== 'admin' && vaitro !== 'user') {
    return { ok: false, message: 'Vai trò không hợp lệ', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
  }
  if (trangthai && trangthai !== 'active' && trangthai !== 'noactive') {
    return { ok: false, message: 'Trạng thái không hợp lệ', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
  }

  const $set = {
    hoten,
    sodienthoai,
    diachi,
    gioitinh,
    ngaysinh,
    ngaycapnhat: new Date()
  };

  await Nguoidung.updateOne({ _id: id }, { $set });
  if (vaitro || trangthai) {
    await syncRoleStatusFromUser({ userId: id, vaitro: vaitro || undefined, trangthai: trangthai || undefined });
  }

  return { ok: true, message: 'Cập nhật tài khoản thành công', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
}


async function datMatKhauTuChiTiet({ userId, newPassword, confirmPassword, referer }) {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  const account = await Taikhoan.findOne({ nguoidung_id: id }).select('provider').lean();
  const provider = String(account && account.provider ? account.provider : '').toLowerCase();
  if (provider === 'google') {
    return {
      ok: false,
      message: 'Tài khoản đăng nhập bằng Google không hỗ trợ đặt lại mật khẩu tại đây',
      redirect: quayLaiChiTietHoacDanhSach(referer, id)
    };
  }

  const newpassword = String(newPassword || '');
  const confirmpassword = String(confirmPassword || '');

  if (String(newpassword).length < 6) {
    return { ok: false, message: 'Mật khẩu phải tối thiểu 6 ký tự', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
  }
  if (newpassword !== confirmpassword) {
    return { ok: false, message: 'Xác nhận mật khẩu không khớp', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
  }

  await setPasswordByUserId({ userId: id, newPasswordPlain: newpassword });
  await Nguoidung.updateOne({ _id: id }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
  await syncRoleStatusFromUser({ userId: id });

  return { ok: true, message: 'Đã đặt lại mật khẩu', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
}

async function khoiPhucTuChiTiet(userId, referer) {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: '/admin/users' };
  }

  await Nguoidung.updateOne(
    { _id: id },
    { $set: { daxoa: false, ngaycapnhat: new Date() } }
  );

  return { ok: true, message: 'Đã khôi phục tài khoản', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
}

async function xoaVinhVien(userId, referer) {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: '/admin/users' };
  }

  const result = await Nguoidung.deleteOne({ _id: id, daxoa: true });
  if (!result || result.deletedCount !== 1) {
    return {
      ok: false,
      message: 'Chỉ được xóa vĩnh viễn tài khoản đã xóa mềm',
      redirect: quayLaiChiTietHoacDanhSach(referer, id)
    };
  }

  return { ok: true, message: 'Đã xóa vĩnh viễn tài khoản', redirect: DEFAULT_USERS_URL };
}

module.exports = {
  layDuongDanDanhSachMacDinh,
  xacDinhLoaiFlashKetQua,
  getDanhSachData,
  getDanhSachFallbackData,
  getChiTietData,
  getAnhChupOnlineData,
  capNhatVaiTro,
  capNhatTrangThai,
  xoaMem,
  capNhatTuChiTiet,
  datMatKhauTuChiTiet,
  khoiPhucTuChiTiet,
  xoaVinhVien
};

