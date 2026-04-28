const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Nguoidung = require('../../models/user_model');
const Taikhoan = require('../../models/accounts_model');
const paginationHelper = require('../../helpers/pagination');
const {
  thoatBieuThuc,
  chuanHoaSoDienThoai,
  laSoDienThoaiVN
} = require('../../helpers/validators');
const { datMKTheoId, dongBoVaiTro } = require('./index.js');

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_USERS_URL = '/admin/users';
// Các hàm tiện ích
function duongDanChiTiet(userId) {
  return `/admin/users/${userId}`;
}

function chuanHoaTuKhoa(tukhoa) {
  const k = String(tukhoa || '').trim();
  if (!k) return '';
  return k.slice(0, 100);
}
// tìm kiếm người dùng
function taoDieuKienTuKhoaNguoiDung(tukhoa) {
  const keyword = String(tukhoa || '').trim();
  if (!keyword) return null;

  const keywordRegex = thoatBieuThuc(keyword);
  const dieuKienHoac = [
    { email: { $regex: keywordRegex, $options: 'i' } },
    { hoten: { $regex: keywordRegex, $options: 'i' } }
  ];

  if (mongoose.Types.ObjectId.isValid(keyword)) {
    dieuKienHoac.push({ _id: new mongoose.Types.ObjectId(keyword) });
  }

  return { $or: dieuKienHoac };
}
// Lọc người dùng dựa trên từ khóa tìm kiếm, có thể tìm theo email, họ tên, ID hoặc mã hiển thị
function locNguoiDungTheoTuKhoa(users = [], tukhoa = '') {
  const keyword = String(tukhoa || '').trim().toLowerCase();
  if (!keyword) return users;

  const keywordKhongGach = keyword.replace(/-/g, '');

  return users.filter((u) => {
    const email = String(u?.email || '').toLowerCase();
    const hoten = String(u?.hoten || '').toLowerCase();
    const objectId = String(u?._id || '').toLowerCase();
    const idHienThiRaw = String(u?.idHienThi || taoIdHienThiNguoiDung(u) || '').toLowerCase();
    const idHienThiKhongGach = idHienThiRaw.replace(/-/g, '');

    if (email.includes(keyword) || hoten.includes(keyword) || objectId.includes(keyword)) {
      return true;
    }

    if (idHienThiRaw.includes(keyword)) return true;
    if (keywordKhongGach && idHienThiKhongGach.includes(keywordKhongGach)) return true;
    return false;
  });
}

// Kiểm tra xem lastSeenAt có trong khoảng thời gian được coi là online hay không
function dangOnline(lastseenat, windowms = ONLINE_WINDOW_MS) {
  if (!lastseenat) return false;
  const t = new Date(lastseenat).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= windowms;
}
// Hàm sắp xếp online trước
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

// chuẩn hóa chuỗi
function chuanHoaChuoi(value) {
  return String(value || '').trim();
}

// Phân tích ngày tùy chọn, trả về Date hoặc null nếu không hợp lệ
function phanTichNgayTuyChon(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Chuẩn hóa ngày
function batDauNgay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Kiểm tra xem ngày có phải là ngày trong tương lai so với hiện tại hay không
function laNgayTrongTuongLai(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return false;
  return batDauNgay(date).getTime() > batDauNgay(new Date()).getTime();
}

// Tạo mã hiển thị cho người dùng (không lộ ObjectId hex 24 ký tự)
function taoIdHienThiNguoiDung(user) {
  const rawId = String(user && user._id ? user._id : '').trim();
  if (!rawId) return '';

  const created = new Date(user?.ngaytao || user?.createdAt || Date.now());
  const hopLeNgay = !Number.isNaN(created.getTime());
  const ngay = hopLeNgay
    ? `${String(created.getFullYear()).slice(-2)}${String(created.getMonth() + 1).padStart(2, '0')}${String(created.getDate()).padStart(2, '0')}`
    : '000000';

  const maRutGon = crypto
    .createHash('sha1')
    .update(rawId)
    .digest('base64url')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  return `ND-${ngay}-${maRutGon || 'UNKNOWN'}`;
}

// Tạo bộ lọc cho truy vấn người dùng dựa trên các tham số
function taoBoLocNguoiDung({ keyword: tukhoa, online, deleted }) {
  const boloc =
    deleted === '1' ? { daxoa: true }
      : deleted === 'all' ? {}
        : { daxoa: { $ne: true } };

  const dieukienva = [];
  const dieuKienTuKhoa = taoDieuKienTuKhoaNguoiDung(tukhoa);
  if (dieuKienTuKhoa) dieukienva.push(dieuKienTuKhoa);

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

// Tạo bộ lọc người dùng dựa trên vai trò và trạng thái từ tài khoản
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

// Gắn thông tin tài khoản vào danh sách người dùng, hỗ trợ cập nhật vai trò và trạng thái từ tài khoản nếu có
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

// Tạo chuỗi bộ lọc để giữ nguyên các tham số khi phân trang hoặc quay lại danh sách
function taoChuoiBoLoc({ vaitro, trangthai, online, deleted, limit }) {
  let s = '';
  if (vaitro) s += `&vaitro=${encodeURIComponent(vaitro)}`;
  if (trangthai) s += `&trangthai=${encodeURIComponent(trangthai)}`;
  if (online) s += `&online=${encodeURIComponent(online)}`;
  if (deleted) s += `&deleted=${encodeURIComponent(deleted)}`;
  if (limit) s += `&limit=${encodeURIComponent(limit)}`;
  return s;
}

// Xác định loại flash message dựa trên kết quả thực hiện
function quayLaiChiTietHoacDanhSach(referer, userid) {
  const chiTiet = duongDanChiTiet(userid);
  const ref = String(referer || '');
  if (ref.includes(`/admin/users/${userid}`)) return chiTiet;
  return DEFAULT_USERS_URL;
}
// Các hàm chính của service
function layDuongDanDanhSachMacDinh() {
  return DEFAULT_USERS_URL;
}

// Xác định loại flash message dựa trên kết quả thực hiện
function xacDinhLoaiFlashKetQua(result) {
  return result && result.ok ? 'success' : 'error';
}

// lấy dữ liệu danh sách người dùng với phân trang và bộ lọc
function getDanhSachFallbackData() {
  return {
    titlePage: 'Quản lý người dùng',
    users: [],
    filters: { keyword: '', vaitro: '', trangthai: '', online: '', deleted: '', limit: 10 },
    pagination: { currentPage: 1, limit: 10, skip: 0, totalPages: 0, totalProducts: 0 },
    filterString: ''
  };
}
// lấy dữ liệu danh sách người dùng với phân trang và bộ lọc
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

  const dieukien = taoBoLocNguoiDung({ keyword: '', vaitro, trangthai, online, deleted: daxoa });
  const themDieuKienTheoAccount = await taoBoLocNguoiDungTheoAccount({ vaitro, trangthai });
  if (themDieuKienTheoAccount) {
    if (dieukien.$and) dieukien.$and.push(themDieuKienTheoAccount);
    else dieukien.$and = [themDieuKienTheoAccount];
  }

  const chuoiboloc = taoChuoiBoLoc({ vaitro, trangthai, online, deleted: daxoa, limit });

  if (tukhoa) {
    const tatCaNguoiDung = await Nguoidung.find(dieukien)
      .sort({ lastSeenAt: -1, ngaytao: -1 })
      .lean();

    const daGanAccount = await ganThongTinAccount(tatCaNguoiDung);
    const tatCaNguoiDungDaXuLy = daGanAccount.map((u) => ({
      ...u,
      idHienThi: taoIdHienThiNguoiDung(u),
      isOnline: dangOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
    })).sort(sapXepOnlineTruoc);

    const nguoiDungSauLoc = locNguoiDungTheoTuKhoa(tatCaNguoiDungDaXuLy, tukhoa);
    phantrang = paginationHelper(phantrang, query, nguoiDungSauLoc.length);
    const nguoidungdaxuly = nguoiDungSauLoc.slice(phantrang.skip, phantrang.skip + phantrang.limit);

    return {
      titlePage: 'Quản lý người dùng',
      users: nguoidungdaxuly,
      filters: { keyword: tukhoa, vaitro, trangthai, online, deleted: daxoa, limit },
      pagination: phantrang,
      filterString: chuoiboloc
    };
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
    idHienThi: taoIdHienThiNguoiDung(u),
    isOnline: dangOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
  })).sort(sapXepOnlineTruoc);

  return {
    titlePage: 'Quản lý người dùng',
    users: nguoidungdaxuly,
    filters: { keyword: tukhoa, vaitro, trangthai, online, deleted: daxoa, limit },
    pagination: phantrang,
    filterString: chuoiboloc
  };
}

// lấy dữ liệu chi tiết người dùng
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
    idHienThi: taoIdHienThiNguoiDung(taikhoandagan),
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

// lấy dữ liệu ảnh chụp  và  phân trang
async function getAnhChupOnlineData(query = {}) {
  const tukhoa = chuanHoaTuKhoa(query.keyword);
  const vaitro = String(query.vaitro || '').trim();
  const trangthai = String(query.trangthai || '').trim();
  const online = String(query.online || '').trim();
  const daxoa = String(query.deleted || '').trim();

  let phantrang = {
    currentPage: 1,
    limit: Number.isFinite(parseInt(query.limit, 10))
      ? Math.min(100, Math.max(5, parseInt(query.limit, 10)))
      : 10
  };

  const dieukien = taoBoLocNguoiDung({ keyword: '', vaitro, trangthai, online, deleted: daxoa });
  const themDieuKienTheoAccount = await taoBoLocNguoiDungTheoAccount({ vaitro, trangthai });
  if (themDieuKienTheoAccount) {
    if (dieukien.$and) dieukien.$and.push(themDieuKienTheoAccount);
    else dieukien.$and = [themDieuKienTheoAccount];
  }

  if (tukhoa) {
    const tatCaNguoiDung = await Nguoidung.find(dieukien)
      .select({ _id: 1, lastSeenAt: 1, email: 1, hoten: 1, ngaytao: 1, createdAt: 1 })
      .sort({ lastSeenAt: -1, ngaytao: -1 })
      .lean();

    const tatCaDaXuLy = tatCaNguoiDung.map((u) => ({
      ...u,
      idHienThi: taoIdHienThiNguoiDung(u),
      isOnline: dangOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
    })).sort(sapXepOnlineTruoc);

    const nguoiDungSauLoc = locNguoiDungTheoTuKhoa(tatCaDaXuLy, tukhoa);
    phantrang = paginationHelper(phantrang, query, nguoiDungSauLoc.length);

    const anhchup = nguoiDungSauLoc
      .slice(phantrang.skip, phantrang.skip + phantrang.limit)
      .map((u) => ({
        id: String(u._id),
        isOnline: !!u.isOnline,
        lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null
      }));

    return {
      now: new Date().toISOString(),
      users: anhchup
    };
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
// Cập nhật vai trò của người dùng
async function capNhatVaiTro(userId, vaitro) {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  const role = String(vaitro || '').trim();
  if (role !== 'admin' && role !== 'user') {
    return { ok: false, message: 'Vai trò không hợp lệ  ', redirect: DEFAULT_USERS_URL };
  }

  await dongBoVaiTro({ userId: id, vaitro: role });
  await Nguoidung.updateOne({ _id: id, daxoa: { $ne: true } }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
  return { ok: true, message: 'Cập nhật vai trò thành công', redirect: DEFAULT_USERS_URL };
}
// Cập nhật trạng thái của người dùng
async function capNhatTrangThai(userId, trangthai, currentAdminId = '') {
  const id = String(userId || '');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'ID khách hàng không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  const status = String(trangthai || '').trim();
  if (status !== 'active' && status !== 'noactive') {
    return { ok: false, message: 'Trạng thái không hợp lệ', redirect: DEFAULT_USERS_URL };
  }

  if (String(currentAdminId || '') === id && status !== 'active') {
    return { ok: false, message: 'Không thể tự khóa chính tài khoản admin đang đăng nhập', redirect: DEFAULT_USERS_URL };
  }

  await dongBoVaiTro({ userId: id, trangthai: status });
  await Nguoidung.updateOne({ _id: id, daxoa: { $ne: true } }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
  return { ok: true, message: 'Cập nhật trạng thái thành công', redirect: DEFAULT_USERS_URL };
}

// Xóa mềm 
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

// cập nhật thông tin chi tiết người dùng từ trang chi tiết
function xoaAnhCuNeuCan(urlCu, urlMoi) {
  const currentUrl = String(urlCu || '').trim();
  const nextUrl = String(urlMoi || '').trim();
  if (!currentUrl || !currentUrl.startsWith('/uploads/avatars/') || currentUrl === nextUrl) return;

  const tenCu = path.basename(currentUrl);
  const duongDanCu = path.join(process.cwd(), 'public', 'uploads', 'avatars', tenCu);
  fs.promises.unlink(duongDanCu).catch(() => {});
}

async function capNhatTuChiTiet({ userId, currentAdminId, body, filesUpload }) {
  const id = String(userId || '');
  const idAdminDangNhap = String(currentAdminId || '');
  const redirectChiTiet = duongDanChiTiet(id);
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
  const nguoiDungHienTai = await Nguoidung.findById(id).select('avatar chukyso vaitro').lean().catch(() => null);
  const vaiTroHienTai = String(nguoiDungHienTai?.vaitro || 'user').trim();
  const vaiTroSauCapNhat = vaitro || vaiTroHienTai || 'user';

  if (rawphone && !laSoDienThoaiVN(rawphone)) {
    return { ok: false, message: 'Số điện thoại không đúng định dạng', redirect: redirectChiTiet };
  }
  if (ngaysinhRaw && !ngaysinh) {
    return { ok: false, message: 'Ngày sinh không hợp lệ', redirect: redirectChiTiet };
  }

  if (ngaysinh && laNgayTrongTuongLai(ngaysinh)) {
    return { ok: false, message: 'Ngày sinh không được vượt quá ngày hiện tại', redirect: redirectChiTiet };
  }

  if (vaitro && vaitro !== 'admin' && vaitro !== 'user') {
    return { ok: false, message: 'Vai trò không hợp lệ', redirect: redirectChiTiet };
  }
  if (trangthai && trangthai !== 'active' && trangthai !== 'noactive') {
    return { ok: false, message: 'Trạng thái không hợp lệ', redirect: redirectChiTiet };
  }

  if (idAdminDangNhap && idAdminDangNhap === id) {
    if (vaitro && vaitro !== 'admin') {
      return {
        ok: false,
        message: 'Không thể tự đổi vai trò của chính tài khoản admin đang đăng nhập',
        redirect: redirectChiTiet
      };
    }
    if (trangthai && trangthai !== 'active') {
      return {
        ok: false,
        message: 'Không thể tự khóa chính tài khoản admin đang đăng nhập',
        redirect: redirectChiTiet
      };
    }
  }

  const avatarUpload = filesUpload?.avatarFile?.[0] || null;
  const signatureUpload = filesUpload?.signatureFile?.[0] || null;
  const nguoiDungCu = nguoiDungHienTai;

  const $set = {
    hoten,
    sodienthoai,
    diachi,
    gioitinh,
    ngaysinh,
    ngaycapnhat: new Date()
  };

  if (avatarUpload && avatarUpload.filename) {
    const avatarMoi = `/uploads/avatars/${avatarUpload.filename}`;
    $set.avatar = avatarMoi;
    xoaAnhCuNeuCan(nguoiDungCu?.avatar, avatarMoi);
  }

  if (vaiTroSauCapNhat === 'admin' && signatureUpload && signatureUpload.filename) {
    const chuKyMoi = `/uploads/avatars/${signatureUpload.filename}`;
    $set.chukyso = chuKyMoi;
    xoaAnhCuNeuCan(nguoiDungCu?.chukyso, chuKyMoi);
  }

  await Nguoidung.updateOne({ _id: id }, { $set });
  if (vaitro || trangthai) {
    await dongBoVaiTro({ userId: id, vaitro: vaitro || undefined, trangthai: trangthai || undefined });
  }

  return { ok: true, message: 'Cập nhật tài khoản thành công', redirect: redirectChiTiet };
}

// đặt lại mật khẩu của người dùng
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

  await datMKTheoId({ userId: id, newPasswordPlain: newpassword });
  await Nguoidung.updateOne({ _id: id }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
  await dongBoVaiTro({ userId: id });

  return { ok: true, message: 'Đã đặt lại mật khẩu', redirect: quayLaiChiTietHoacDanhSach(referer, id) };
}
// Khôi phục tài khoản đã xóa mềm
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
// Xóa vĩnh viễn tài khoản
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



