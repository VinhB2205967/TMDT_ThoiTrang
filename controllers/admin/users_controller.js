const Nguoidung = require('../../models/user_model');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const paginationHelper = require('../../helpers/pagination');
const { escapeRegex, normalizePhone, isValidPhoneVN, isSafeImageUrl } = require('../../helpers/validators');

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function normalizeKeyword(keyword) {
  const k = String(keyword || '').trim();
  if (!k) return '';
  // Avoid regex injection / heavy patterns
  return escapeRegex(k.slice(0, 100));
}

function isOnline(lastSeenAt, windowMs) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= windowMs;
}

function normalizeString(value) {
  return String(value || '').trim();
}

function parseOptionalDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function backToDetailOrList(req, userId) {
  const ref = String(req.get('referer') || '');
  if (ref.includes(`/admin/users/${userId}`)) return `/admin/users/${userId}`;
  return '/admin/users';
}

async function buildUserList({ keyword, vaitro, trangthai, deleted }) {
  // Deprecated: kept for backward compatibility of require() smoke tests.
  // Use buildUserFilter + pagination in index/onlineSnapshot.
  const filter = buildUserFilter({ keyword, vaitro, trangthai, online: '', deleted });
  return Nguoidung.find(filter).sort({ ngaytao: -1 }).lean();
}

function buildUserFilter({ keyword, vaitro, trangthai, online, deleted }) {
  // deleted: '' | '1' | 'all'
  const filter =
    deleted === '1' ? { daxoa: true }
      : deleted === 'all' ? {}
        : { daxoa: { $ne: true } };

  if (vaitro === 'admin' || vaitro === 'user') filter.vaitro = vaitro;
  if (trangthai === 'active' || trangthai === 'noactive') filter.trangthai = trangthai;

  const and = [];
  if (keyword) {
    and.push({
      $or: [
        { email: { $regex: keyword, $options: 'i' } },
        { hoten: { $regex: keyword, $options: 'i' } }
      ]
    });
  }

  const threshold = new Date(Date.now() - ONLINE_WINDOW_MS);
  if (online === '1') {
    filter.lastSeenAt = { $gte: threshold };
  } else if (online === '0') {
    and.push({
      $or: [
        { lastSeenAt: { $lt: threshold } },
        { lastSeenAt: { $exists: false } },
        { lastSeenAt: null }
      ]
    });
  }

  if (and.length) filter.$and = and;

  return filter;
}

function buildUserFilterString({ vaitro, trangthai, online, deleted }) {
  let s = '';
  if (vaitro) s += `&vaitro=${encodeURIComponent(vaitro)}`;
  if (trangthai) s += `&trangthai=${encodeURIComponent(trangthai)}`;
  if (online) s += `&online=${encodeURIComponent(online)}`;
  if (deleted) s += `&deleted=${encodeURIComponent(deleted)}`;
  return s;
}

// GET /admin/users
module.exports.index = async (req, res) => {
  try {
    const keyword = normalizeKeyword(req.query.keyword);
    const vaitro = String(req.query.vaitro || '').trim();
    const trangthai = String(req.query.trangthai || '').trim();
    const online = String(req.query.online || '').trim();
    const deleted = String(req.query.deleted || '').trim();

    let objectPagination = {
      currentPage: 1,
      limit: 10
    };

    const find = buildUserFilter({ keyword, vaitro, trangthai, online, deleted });
    const totalUsers = await Nguoidung.countDocuments(find);
    objectPagination = paginationHelper(objectPagination, req.query, totalUsers);

    const users = await Nguoidung.find(find)
      .sort({ ngaytao: -1 })
      .skip(objectPagination.skip)
      .limit(objectPagination.limit)
      .lean();

    const decorated = users.map(u => ({
      ...u,
      isOnline: isOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
    }));

    const filterString = buildUserFilterString({ vaitro, trangthai, online, deleted });

    return res.render('admin/pages/users/index.pug', {
      titlePage: 'Quản lý người dùng',
      users: decorated,
      filters: { keyword, vaitro, trangthai, online, deleted },
      pagination: objectPagination,
      filterString
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

// GET /admin/users/:id
module.exports.detail = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const u = await Nguoidung.findById(id).lean();
    if (!u) {
      req.flash('error', 'Không tìm thấy người dùng');
      return res.redirect('/admin/users');
    }

    const decorated = {
      ...u,
      isOnline: isOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
    };

    return res.render('admin/pages/users/detail.pug', {
      titlePage: 'Chi tiết tài khoản',
      u: decorated
    });
  } catch (err) {
    console.error('admin users detail error:', err);
    req.flash('error', 'Không thể tải chi tiết tài khoản');
    return res.redirect('/admin/users');
  }
};

// GET /admin/users/online (JSON snapshot for polling)
module.exports.onlineSnapshot = async (req, res) => {
  try {
    const keyword = normalizeKeyword(req.query.keyword);
    const vaitro = String(req.query.vaitro || '').trim();
    const trangthai = String(req.query.trangthai || '').trim();
    const online = String(req.query.online || '').trim();
    const deleted = String(req.query.deleted || '').trim();

    let objectPagination = {
      currentPage: 1,
      limit: 10
    };

    const find = buildUserFilter({ keyword, vaitro, trangthai, online, deleted });
    const totalUsers = await Nguoidung.countDocuments(find);
    objectPagination = paginationHelper(objectPagination, req.query, totalUsers);

    const users = await Nguoidung.find(find)
      .select({ _id: 1, lastSeenAt: 1 })
      .sort({ ngaytao: -1 })
      .skip(objectPagination.skip)
      .limit(objectPagination.limit)
      .lean();

    const snapshot = users.map(u => {
      const onlineNow = isOnline(u.lastSeenAt, ONLINE_WINDOW_MS);
      return {
        id: String(u._id),
        isOnline: onlineNow,
        lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null
      };
    });
    return res.json({
      now: new Date().toISOString(),
      users: snapshot
    });
  } catch (err) {
    console.error('admin users onlineSnapshot error:', err);
    return res.status(500).json({ now: new Date().toISOString(), users: [] });
  }
};

// POST /admin/users/:id/role
module.exports.updateRole = async (req, res) => {
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

    await Nguoidung.updateOne(
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

// POST /admin/users/:id/status
module.exports.updateStatus = async (req, res) => {
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

    await Nguoidung.updateOne(
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

// POST /admin/users/:id/delete
module.exports.softDelete = async (req, res) => {
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

// POST /admin/users/:id/update
module.exports.updateFromDetail = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const hoten = normalizeString(req.body.hoten);
    const rawPhone = normalizeString(req.body.sodienthoai);
    const sodienthoai = rawPhone ? normalizePhone(rawPhone) : '';
    const diachi = normalizeString(req.body.diachi);
    const gioitinh = normalizeString(req.body.gioitinh);
    const avatar = normalizeString(req.body.avatar);
    const ngaysinh = parseOptionalDate(req.body.ngaysinh);

    const vaitro = normalizeString(req.body.vaitro);
    const trangthai = normalizeString(req.body.trangthai);

    if (rawPhone && !isValidPhoneVN(rawPhone)) {
      req.flash('error', 'Số điện thoại không đúng định dạng');
      return res.redirect(backToDetailOrList(req, id));
    }

    if (avatar && !isSafeImageUrl(avatar)) {
      req.flash('error', 'Avatar URL không hợp lệ');
      return res.redirect(backToDetailOrList(req, id));
    }

    if (vaitro && vaitro !== 'admin' && vaitro !== 'user') {
      req.flash('error', 'Vai trò không hợp lệ');
      return res.redirect(backToDetailOrList(req, id));
    }
    if (trangthai && trangthai !== 'active' && trangthai !== 'noactive') {
      req.flash('error', 'Trạng thái không hợp lệ');
      return res.redirect(backToDetailOrList(req, id));
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
    return res.redirect(backToDetailOrList(req, id));
  } catch (err) {
    console.error('admin users updateFromDetail error:', err);
    req.flash('error', 'Không thể cập nhật tài khoản');
    return res.redirect('/admin/users');
  }
};

// POST /admin/users/:id/password
module.exports.setPasswordFromDetail = async (req, res) => {
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
      return res.redirect(backToDetailOrList(req, id));
    }
    if (newPassword !== confirmPassword) {
      req.flash('error', 'Xác nhận mật khẩu không khớp');
      return res.redirect(backToDetailOrList(req, id));
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await Nguoidung.updateOne(
      { _id: id },
      { $set: { matkhau: hashed, ngaycapnhat: new Date() } }
    );

    req.flash('success', 'Đã đặt lại mật khẩu');
    return res.redirect(backToDetailOrList(req, id));
  } catch (err) {
    console.error('admin users setPasswordFromDetail error:', err);
    req.flash('error', 'Không thể đặt lại mật khẩu');
    return res.redirect('/admin/users');
  }
};

// POST /admin/users/:id/restore
module.exports.restoreFromDetail = async (req, res) => {
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
    return res.redirect(backToDetailOrList(req, id));
  } catch (err) {
    console.error('admin users restoreFromDetail error:', err);
    req.flash('error', 'Không thể khôi phục tài khoản');
    return res.redirect('/admin/users');
  }
};

// POST /admin/users/:id/hard-delete
module.exports.hardDelete = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID không hợp lệ');
      return res.redirect('/admin/users');
    }

    const result = await Nguoidung.deleteOne({ _id: id, daxoa: true });
    if (!result || result.deletedCount !== 1) {
      req.flash('error', 'Chỉ được xóa vĩnh viễn tài khoản đã xóa mềm');
      return res.redirect(backToDetailOrList(req, id));
    }

    req.flash('success', 'Đã xóa vĩnh viễn tài khoản');
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('admin users hardDelete error:', err);
    req.flash('error', 'Không thể xóa vĩnh viễn tài khoản');
    return res.redirect('/admin/users');
  }
};
