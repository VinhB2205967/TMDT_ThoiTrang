const nguoidung = require('../../models/user_model');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const paginationHelper = require('../../helpers/pagination');
const { thoatBieuThuc, chuanHoaSoDienThoai, laSoDienThoaiVN, laUrlAnhAnToan } = require('../../helpers/validators');

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
  return nguoidung.find(boloc).sort({ ngaytao: -1 }).lean();
}

function taoBoLocNguoiDung({ keyword: tukhoa, vaitro, trangthai, online, deleted }) {
  // Lọc
  const boloc =
    deleted === '1' ? { daxoa: true }
      : deleted === 'all' ? {}
        : { daxoa: { $ne: true } };

  if (vaitro === 'admin' || vaitro === 'user') boloc.vaitro = vaitro;
  if (trangthai === 'active' || trangthai === 'noactive') boloc.trangthai = trangthai;

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
    const tongnguoidung = await nguoidung.countDocuments(dieukien);
    phantrang = paginationHelper(phantrang, req.query, tongnguoidung);

    const danhsachnguoidung = await nguoidung.find(dieukien)
      .sort({ ngaytao: -1 })
      .skip(phantrang.skip)
      .limit(phantrang.limit)
      .lean();

    const nguoidungdaxuly = danhsachnguoidung.map(u => ({
      ...u,
      isOnline: dangOnline(u.lastSeenAt, onlinewindowms)
    }));

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

    const taikhoandaxuly = {
      ...taikhoan,
      isOnline: dangOnline(taikhoan.lastSeenAt, onlinewindowms)
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
    const tongnguoidung = await nguoidung.countDocuments(dieukien);
    phantrang = paginationHelper(phantrang, req.query, tongnguoidung);

    const danhsachnguoidung = await nguoidung.find(dieukien)
      .select({ _id: 1, lastSeenAt: 1 })
      .sort({ ngaytao: -1 })
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
    });
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

    await nguoidung.updateOne(
      { _id: id, daxoa: { $ne: true } },
      { $set: { vaitro, ngaycapnhat: new Date() } }
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

    const trangthai = String(req.body.trangthai || '').trim();
    if (trangthai !== 'active' && trangthai !== 'noactive') {
      req.flash('error', 'Trạng thái không hợp lệ');
      return res.redirect('/admin/users');
    }

    await nguoidung.updateOne(
      { _id: id, daxoa: { $ne: true } },
      { $set: { trangthai, ngaycapnhat: new Date() } }
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
    if (vaitro) $set.vaitro = vaitro;
    if (trangthai) $set.trangthai = trangthai;

    await nguoidung.updateOne({ _id: id }, { $set });
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

    const hashed = await bcrypt.hash(newpassword, 10);
    await nguoidung.updateOne(
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
