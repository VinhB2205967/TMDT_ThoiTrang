const Nguoidung = require('../../models/user_model');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const paginationHelper = require('../../helpers/pagination');
const { escapeRegex, normalizePhone, isValidPhoneVN, isSafeImageUrl } = require('../../helpers/validators');

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function chuanHoaTuKhoa(tuKhoa) {
  const k = String(tuKhoa || '').trim();
  if (!k) return '';
  // Avoid regex injection / heavy patterns
  return escapeRegex(k.slice(0, 100));
}

function dangOnline(lastSeenAt, windowMs) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= windowMs;
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

function quayLaiChiTietHoacDanhSach(req, userId) {
  const ref = String(req.get('referer') || '');
  if (ref.includes(`/admin/users/${userId}`)) return `/admin/users/${userId}`;
  return '/admin/users';
}

async function taoDanhSachNguoiDung({ keyword: tuKhoa, vaitro, trangthai, deleted }) {
  // Danh sách (deprecated)
  const boLoc = taoBoLocNguoiDung({ keyword: tuKhoa, vaitro, trangthai, online: '', deleted });
  return Nguoidung.find(boLoc).sort({ ngaytao: -1 }).lean();
}

function taoBoLocNguoiDung({ keyword: tuKhoa, vaitro, trangthai, online, deleted }) {
  // Lọc
  const boLoc =
    deleted === '1' ? { daxoa: true }
      : deleted === 'all' ? {}
        : { daxoa: { $ne: true } };

  if (vaitro === 'admin' || vaitro === 'user') boLoc.vaitro = vaitro;
  if (trangthai === 'active' || trangthai === 'noactive') boLoc.trangthai = trangthai;

  const dieuKienVa = [];
  if (tuKhoa) {
    dieuKienVa.push({
      $or: [
        { email: { $regex: tuKhoa, $options: 'i' } },
        { hoten: { $regex: tuKhoa, $options: 'i' } }
      ]
    });
  }

  const mocThoiGian = new Date(Date.now() - ONLINE_WINDOW_MS);
  if (online === '1') {
    boLoc.lastSeenAt = { $gte: mocThoiGian };
  } else if (online === '0') {
    dieuKienVa.push({
      $or: [
        { lastSeenAt: { $lt: mocThoiGian } },
        { lastSeenAt: { $exists: false } },
        { lastSeenAt: null }
      ]
    });
  }

  if (dieuKienVa.length) boLoc.$and = dieuKienVa;

  return boLoc;
}

function taoChuoiBoLoc({ vaitro, trangthai, online, deleted }) {
  let s = '';
  if (vaitro) s += `&vaitro=${encodeURIComponent(vaitro)}`;
  if (trangthai) s += `&trangthai=${encodeURIComponent(trangthai)}`;
  if (online) s += `&online=${encodeURIComponent(online)}`;
  if (deleted) s += `&deleted=${encodeURIComponent(deleted)}`;
  return s;
}

// Danh sách
module.exports.danhSach = async (req, res) => {
  try {
    const tuKhoa = chuanHoaTuKhoa(req.query.keyword);
    const vaiTro = String(req.query.vaitro || '').trim();
    const trangThai = String(req.query.trangthai || '').trim();
    const online = String(req.query.online || '').trim();
    const daXoa = String(req.query.deleted || '').trim();

    let phanTrang = {
      currentPage: 1,
      limit: 10
    };

    const dieuKien = taoBoLocNguoiDung({ keyword: tuKhoa, vaitro: vaiTro, trangthai: trangThai, online, deleted: daXoa });
    const tongNguoiDung = await Nguoidung.countDocuments(dieuKien);
    phanTrang = paginationHelper(phanTrang, req.query, tongNguoiDung);

    const danhSachNguoiDung = await Nguoidung.find(dieuKien)
      .sort({ ngaytao: -1 })
      .skip(phanTrang.skip)
      .limit(phanTrang.limit)
      .lean();

    const nguoiDungDaXuLy = danhSachNguoiDung.map(u => ({
      ...u,
      isOnline: dangOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
    }));

    const chuoiBoLoc = taoChuoiBoLoc({ vaitro: vaiTro, trangthai: trangThai, online, deleted: daXoa });

    return res.render('admin/pages/users/index.pug', {
      titlePage: 'Quản lý người dùng',
      users: nguoiDungDaXuLy,
      filters: { keyword: tuKhoa, vaitro: vaiTro, trangthai: trangThai, online, deleted: daXoa },
      pagination: phanTrang,
      filterString: chuoiBoLoc
    });
  } catch (err) {
    console.error('admin users index error:', err);
    req.flash('error', 'Không thể tải danh sách người dùng');
    return res.render('admin/pages/users/index.pug', {
      titlePage: 'Quản lý người dùng',
      users: [],
      filters: { keyword: '', vaitro: '', trangthai: '', online: '', deleted: '' },
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

    const nguoiDung = await Nguoidung.findById(id).lean();
    if (!nguoiDung) {
      req.flash('error', 'Không tìm thấy người dùng');
      return res.redirect('/admin/users');
    }

    const nguoiDungDaXuLy = {
      ...nguoiDung,
      isOnline: dangOnline(nguoiDung.lastSeenAt, ONLINE_WINDOW_MS)
    };

    return res.render('admin/pages/users/detail.pug', {
      titlePage: 'Chi tiết tài khoản',
      u: nguoiDungDaXuLy
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
    const tuKhoa = chuanHoaTuKhoa(req.query.keyword);
    const vaiTro = String(req.query.vaitro || '').trim();
    const trangThai = String(req.query.trangthai || '').trim();
    const online = String(req.query.online || '').trim();
    const daXoa = String(req.query.deleted || '').trim();

    let phanTrang = {
      currentPage: 1,
      limit: 10
    };

    const dieuKien = taoBoLocNguoiDung({ keyword: tuKhoa, vaitro: vaiTro, trangthai: trangThai, online, deleted: daXoa });
    const tongNguoiDung = await Nguoidung.countDocuments(dieuKien);
    phanTrang = paginationHelper(phanTrang, req.query, tongNguoiDung);

    const danhSachNguoiDung = await Nguoidung.find(dieuKien)
      .select({ _id: 1, lastSeenAt: 1 })
      .sort({ ngaytao: -1 })
      .skip(phanTrang.skip)
      .limit(phanTrang.limit)
      .lean();

    const anhChup = danhSachNguoiDung.map(u => {
      const onlineNow = dangOnline(u.lastSeenAt, ONLINE_WINDOW_MS);
      return {
        id: String(u._id),
        isOnline: onlineNow,
        lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null
      };
    });
    return res.json({
      now: new Date().toISOString(),
      users: anhChup
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

    const vaiTro = String(req.body.vaitro || '').trim();
    if (vaiTro !== 'admin' && vaiTro !== 'user') {
      req.flash('error', 'Vai trò không hợp lệ');
      return res.redirect('/admin/users');
    }

    await Nguoidung.updateOne(
      { _id: id, daxoa: { $ne: true } },
      { $set: { vaitro: vaiTro, ngaycapnhat: new Date() } }
    );
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

    const trangThai = String(req.body.trangthai || '').trim();
    if (trangThai !== 'active' && trangThai !== 'noactive') {
      req.flash('error', 'Trạng thái không hợp lệ');
      return res.redirect('/admin/users');
    }

    await Nguoidung.updateOne(
      { _id: id, daxoa: { $ne: true } },
      { $set: { trangthai: trangThai, ngaycapnhat: new Date() } }
    );
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

    await Nguoidung.updateOne(
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
    const rawPhone = chuanHoaChuoi(req.body.sodienthoai);
    const sodienthoai = rawPhone ? normalizePhone(rawPhone) : '';
    const diachi = chuanHoaChuoi(req.body.diachi);
    const gioitinh = chuanHoaChuoi(req.body.gioitinh);
    const avatar = chuanHoaChuoi(req.body.avatar);
    const ngaysinh = phanTichNgayTuyChon(req.body.ngaysinh);

    const vaitro = chuanHoaChuoi(req.body.vaitro);
    const trangthai = chuanHoaChuoi(req.body.trangthai);

    if (rawPhone && !isValidPhoneVN(rawPhone)) {
      req.flash('error', 'Số điện thoại không đúng định dạng');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }

    if (avatar && !isSafeImageUrl(avatar)) {
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
    if (vaitro) $set.vaitro = vaitro;
    if (trangthai) $set.trangthai = trangthai;

    await Nguoidung.updateOne({ _id: id }, { $set });
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

    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (String(newPassword).length < 6) {
      req.flash('error', 'Mật khẩu phải tối thiểu 6 ký tự');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }
    if (newPassword !== confirmPassword) {
      req.flash('error', 'Xác nhận mật khẩu không khớp');
      return res.redirect(quayLaiChiTietHoacDanhSach(req, id));
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await Nguoidung.updateOne(
      { _id: id },
      { $set: { matkhau: hashed, ngaycapnhat: new Date() } }
    );

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

    await Nguoidung.updateOne(
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

    const result = await Nguoidung.deleteOne({ _id: id, daxoa: true });
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
