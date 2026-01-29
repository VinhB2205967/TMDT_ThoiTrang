const nguoidung = require('../../models/user_model');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Taikhoan = require('../../models/accounts_model');
const paginationHelper = require('../../helpers/pagination');
const { thoatBieuThuc, chuanHoaSoDienThoai, laSoDienThoaiVN, laUrlAnhAnToan } = require('../../helpers/validators');
const { setPasswordByUserId, syncRoleStatusFromUser } = require('../../services/account.service');

const onlinewindowms = 5 * 60 * 1000;

function chuanHoaTuKhoa(tukhoa) {
  const k = String(tukhoa || '').trim();
  if (!k) return '';
  // Avoid regex injection / heavy patterns
  return thoatBieuThuc(k.slice(0, 100));
}

function dangOnline(lastseenat, windowms) {
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

function quayLaiChiTietHoacDanhSach(req, userid) {
  const ref = String(req.get('referer') || '');
  if (ref.includes(`/admin/users/${userid}`)) return `/admin/users/${userid}`;
  return '/admin/users';
}

async function taoDanhSachNguoiDung({ keyword: tukhoa, vaitro, trangthai, deleted }) {
  // Danh sách (deprecated)
  const boloc = taoBoLocNguoiDung({ keyword: tukhoa, vaitro, trangthai, online: '', deleted });
  return nguoidung.find(boloc).sort({ lastSeenAt: -1, ngaytao: -1 }).lean();
}

function taoBoLocNguoiDung({ keyword: tukhoa, vaitro, trangthai, online, deleted }) {
  // Lọc
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

  const mocthoigian = new Date(Date.now() - onlinewindowms);
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
  const userIds = ids.map(r => r.nguoidung_id).filter(Boolean);
  if (!userIds.length) {
    // impossible filter to return empty list
    return { _id: { $in: [] } };
  }
  return { _id: { $in: userIds } };
}

async function ganThongTinAccount(users) {
  const userIds = users.map(u => u && u._id).filter(Boolean);
  if (!userIds.length) return users;

  const accounts = await Taikhoan.find({ nguoidung_id: { $in: userIds } })
    .select('nguoidung_id email provider vaitro trangthai xacthuc')
    .lean();

  const map = new Map(accounts.map(a => [String(a.nguoidung_id), a]));
  return users.map(u => {
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

// Danh sách
module.exports.danhSach = async (req, res) => {
  try {
    const tukhoa = chuanHoaTuKhoa(req.query.keyword);
    const vaitro = String(req.query.vaitro || '').trim();
    const trangthai = String(req.query.trangthai || '').trim();
    const online = String(req.query.online || '').trim();
    const daxoa = String(req.query.deleted || '').trim();
    const limitRaw = parseInt(req.query.limit, 10);
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
    const tongnguoidung = await nguoidung.countDocuments(dieukien);
    phantrang = paginationHelper(phantrang, req.query, tongnguoidung);

    const danhsachnguoidung = await nguoidung.find(dieukien)
      .sort({ lastSeenAt: -1, ngaytao: -1 })
      .skip(phantrang.skip)
      .limit(phantrang.limit)
      .lean();

    const daGanAccount = await ganThongTinAccount(danhsachnguoidung);
    const nguoidungdaxuly = daGanAccount.map(u => ({
      ...u,
      isOnline: dangOnline(u.lastSeenAt, onlinewindowms)
    })).sort(sapXepOnlineTruoc);

    const chuoiboloc = taoChuoiBoLoc({ vaitro, trangthai, online, deleted: daxoa, limit });

    return res.render('admin/pages/users/index.pug', {
      titlePage: 'Quản lý người dùng',
      users: nguoidungdaxuly,
      filters: { keyword: tukhoa, vaitro, trangthai, online, deleted: daxoa, limit },
      pagination: phantrang,
      filterString: chuoiboloc
    });
  } catch (err) {
    console.error('admin users index error:', err);
    req.flash('error', 'Không thể tải danh sách người dùng');
    return res.render('admin/pages/users/index.pug', {
      titlePage: 'Quản lý người dùng',
      users: [],
      filters: { keyword: '', vaitro: '', trangthai: '', online: '', deleted: '', limit: 10 },
      pagination: { currentPage: 1, limit: 10, skip: 0, totalPages: 0, totalProducts: 0 },
      filterString: ''
    });
  }
};

// Chi tiết
module.exports.chiTiet = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const taikhoan = await nguoidung.findById(id).lean();
    if (!taikhoan) {
      req.flash('error', 'Không tìm thấy người dùng');
      return res.redirect('/admin/users');
    }

    const [taikhoandagan] = await ganThongTinAccount([taikhoan]);

    const taikhoandaxuly = {
      ...taikhoandagan,
      isOnline: dangOnline(taikhoandagan.lastSeenAt, onlinewindowms)
    };

    return res.render('admin/pages/users/detail.pug', {
      titlePage: 'Chi tiết tài khoản',
      u: taikhoandaxuly
    });
  } catch (err) {
    console.error('admin users detail error:', err);
    req.flash('error', 'Không thể tải chi tiết tài khoản');
    return res.redirect('/admin/users');
  }
};

// Online snapshot
module.exports.anhChupOnline = async (req, res) => {
  try {
    const tukhoa = chuanHoaTuKhoa(req.query.keyword);
    const vaitro = String(req.query.vaitro || '').trim();
    const trangthai = String(req.query.trangthai || '').trim();
    const online = String(req.query.online || '').trim();
    const daxoa = String(req.query.deleted || '').trim();

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
    const tongnguoidung = await nguoidung.countDocuments(dieukien);
    phantrang = paginationHelper(phantrang, req.query, tongnguoidung);

    const danhsachnguoidung = await nguoidung.find(dieukien)
      .select({ _id: 1, lastSeenAt: 1 })
      .sort({ lastSeenAt: -1, ngaytao: -1 })
      .skip(phantrang.skip)
      .limit(phantrang.limit)
      .lean();

    const anhchup = danhsachnguoidung.map(u => {
      const onlinenow = dangOnline(u.lastSeenAt, onlinewindowms);
      return {
        id: String(u._id),
        isOnline: onlinenow,
        lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null
      };
    }).sort(sapXepOnlineTruoc);
    return res.json({
      now: new Date().toISOString(),
      users: anhchup
    });
  } catch (err) {
    console.error('admin users onlineSnapshot error:', err);
    return res.status(500).json({ now: new Date().toISOString(), users: [] });
  }
};

// Cập nhật vai trò
module.exports.capNhatVaiTro = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const vaitro = String(req.body.vaitro || '').trim();
    if (vaitro !== 'admin' && vaitro !== 'user') {
      req.flash('error', 'Vai trò không hợp lệ');
      return res.redirect('/admin/users');
    }

    await syncRoleStatusFromUser({ userId: id, vaitro });
    await nguoidung.updateOne({ _id: id, daxoa: { $ne: true } }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
    req.flash('success', 'Cập nhật vai trò thành công');
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('admin users updateRole error:', err);
    req.flash('error', 'Không thể cập nhật vai trò');
    return res.redirect('/admin/users');
  }
};

// Cập nhật trạng thái
module.exports.capNhatTrangThai = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const trangthai = String(req.body.trangthai || '').trim();
    if (trangthai !== 'active' && trangthai !== 'noactive') {
      req.flash('error', 'Trạng thái không hợp lệ');
      return res.redirect('/admin/users');
    }

    await syncRoleStatusFromUser({ userId: id, trangthai });
    await nguoidung.updateOne({ _id: id, daxoa: { $ne: true } }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
    req.flash('success', 'Cập nhật trạng thái thành công');
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('admin users updateStatus error:', err);
    req.flash('error', 'Không thể cập nhật trạng thái');
    return res.redirect('/admin/users');
  }
};

// Xóa mềm
module.exports.xoaMem = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    await nguoidung.updateOne(
      { _id: id, daxoa: { $ne: true } },
      { $set: { daxoa: true, ngaycapnhat: new Date() } }
    );

    req.flash('success', 'Đã xóa (mềm) tài khoản');
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('admin users softDelete error:', err);
    req.flash('error', 'Không thể xóa tài khoản');
    return res.redirect('/admin/users');
  }
};

// Cập nhật chi tiết
module.exports.capNhatTuChiTiet = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const hoten = chuanHoaChuoi(req.body.hoten);
    const rawphone = chuanHoaChuoi(req.body.sodienthoai);
    const sodienthoai = rawphone ? chuanHoaSoDienThoai(rawphone) : '';
    const diachi = chuanHoaChuoi(req.body.diachi);
    const gioitinh = chuanHoaChuoi(req.body.gioitinh);
    const avatar = chuanHoaChuoi(req.body.avatar);
    const ngaysinh = phanTichNgayTuyChon(req.body.ngaysinh);

    const vaitro = chuanHoaChuoi(req.body.vaitro);
    const trangthai = chuanHoaChuoi(req.body.trangthai);

    if (rawphone && !laSoDienThoaiVN(rawphone)) {
      req.flash('error', 'Số điện thoại không đúng định dạng');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }

    if (avatar && !laUrlAnhAnToan(avatar)) {
      req.flash('error', 'Avatar URL không hợp lệ');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }

    if (vaitro && vaitro !== 'admin' && vaitro !== 'user') {
      req.flash('error', 'Vai trò không hợp lệ');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }
    if (trangthai && trangthai !== 'active' && trangthai !== 'noactive') {
      req.flash('error', 'Trạng thái không hợp lệ');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }

    const $set = {
      hoten,
      sodienthoai,
      diachi,
      gioitinh,
      avatar,
      ngaysinh,
      ngaycapnhat: new Date()
    };

    await nguoidung.updateOne({ _id: id }, { $set });
    if (vaitro || trangthai) {
      await syncRoleStatusFromUser({ userId: id, vaitro: vaitro || undefined, trangthai: trangthai || undefined });
    }
    req.flash('success', 'Cập nhật tài khoản thành công');
    return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
  } catch (err) {
    console.error('admin users updateFromDetail error:', err);
    req.flash('error', 'Không thể cập nhật tài khoản');
    return res.redirect('/admin/users');
  }
};

// Đặt lại mật khẩu
module.exports.datMatKhauTuChiTiet = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const newpassword = String(req.body.newPassword || '');
    const confirmpassword = String(req.body.confirmPassword || '');

    if (String(newpassword).length < 6) {
      req.flash('error', 'Mật khẩu phải tối thiểu 6 ký tự');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }
    if (newpassword !== confirmpassword) {
      req.flash('error', 'Xác nhận mật khẩu không khớp');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }

    await setPasswordByUserId({ userId: id, newPasswordPlain: newpassword });
    await nguoidung.updateOne({ _id: id }, { $set: { ngaycapnhat: new Date() } }).catch(() => {});
    await syncRoleStatusFromUser({ userId: id });

    req.flash('success', 'Đã đặt lại mật khẩu');
    return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
  } catch (err) {
    console.error('admin users setPasswordFromDetail error:', err);
    req.flash('error', 'Không thể đặt lại mật khẩu');
    return res.redirect('/admin/users');
  }
};

// Khôi phục
module.exports.khoiPhucTuChiTiet = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    await nguoidung.updateOne(
      { _id: id },
      { $set: { daxoa: false, ngaycapnhat: new Date() } }
    );
    req.flash('success', 'Đã khôi phục tài khoản');
    return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
  } catch (err) {
    console.error('admin users restoreFromDetail error:', err);
    req.flash('error', 'Không thể khôi phục tài khoản');
    return res.redirect('/admin/users');
  }
};

// Xóa vĩnh viễn
module.exports.xoaVinhVien = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const result = await nguoidung.deleteOne({ _id: id, daxoa: true });
    if (!result || result.deletedCount !== 1) {
      req.flash('error', 'Chỉ được xóa vĩnh viễn tài khoản đã xóa mềm');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }

    req.flash('success', 'Đã xóa vĩnh viễn tài khoản');
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('admin users hardDelete error:', err);
    req.flash('error', 'Không thể xóa vĩnh viễn tài khoản');
    return res.redirect('/admin/users');
  }
};
