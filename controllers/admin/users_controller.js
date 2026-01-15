const Nguoidung = require('../../models/user_model');
const bcrypt = require('bcryptjs');

function normalizeKeyword(keyword) {
  return String(keyword || '').trim();
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

async function buildUserList({ keyword, vaitro, trangthai }) {
  const filter = { daxoa: { $ne: true } };
  if (vaitro === 'admin' || vaitro === 'user') filter.vaitro = vaitro;
  if (trangthai === 'active' || trangthai === 'noactive') filter.trangthai = trangthai;
  if (keyword) {
    filter.$or = [
      { email: { $regex: keyword, $options: 'i' } },
      { hoten: { $regex: keyword, $options: 'i' } }
    ];
  }

  return Nguoidung.find(filter)
    .sort({ ngaytao: -1 })
    .lean();
}

// GET /admin/users
module.exports.index = async (req, res) => {
  const keyword = normalizeKeyword(req.query.keyword);
  const vaitro = String(req.query.vaitro || '').trim();
  const trangthai = String(req.query.trangthai || '').trim();
  const online = String(req.query.online || '').trim();

  const users = await buildUserList({ keyword, vaitro, trangthai });

  const ONLINE_WINDOW_MS = 5 * 60 * 1000;
  const decorated = users.map(u => ({
    ...u,
    isOnline: isOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
  }));

  const finalUsers =
    online === '1' ? decorated.filter(u => u.isOnline)
      : online === '0' ? decorated.filter(u => !u.isOnline)
        : decorated;

  res.render('admin/pages/users/index.pug', {
    titlePage: 'Quản lý người dùng',
    users: finalUsers,
    filters: { keyword, vaitro, trangthai, online }
  });
};

// GET /admin/users/:id
module.exports.detail = async (req, res) => {
  const id = req.params.id;

  const u = await Nguoidung.findById(id).lean();
  if (!u) {
    req.flash('error', 'Không tìm thấy người dùng');
    return res.redirect('/admin/users');
  }

  const ONLINE_WINDOW_MS = 5 * 60 * 1000;
  const decorated = {
    ...u,
    isOnline: isOnline(u.lastSeenAt, ONLINE_WINDOW_MS)
  };

  return res.render('admin/pages/users/detail.pug', {
    titlePage: 'Chi tiết tài khoản',
    u: decorated
  });
};

// GET /admin/users/online (JSON snapshot for polling)
module.exports.onlineSnapshot = async (req, res) => {
  const keyword = normalizeKeyword(req.query.keyword);
  const vaitro = String(req.query.vaitro || '').trim();
  const trangthai = String(req.query.trangthai || '').trim();
  const online = String(req.query.online || '').trim();

  const users = await buildUserList({ keyword, vaitro, trangthai });
  const ONLINE_WINDOW_MS = 5 * 60 * 1000;
  const snapshot = users.map(u => {
    const onlineNow = isOnline(u.lastSeenAt, ONLINE_WINDOW_MS);
    return {
      id: String(u._id),
      isOnline: onlineNow,
      lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null
    };
  });

  const filtered =
    online === '1' ? snapshot.filter(u => u.isOnline)
      : online === '0' ? snapshot.filter(u => !u.isOnline)
        : snapshot;

  res.json({
    now: new Date().toISOString(),
    users: filtered
  });
};

// POST /admin/users/:id/role
module.exports.updateRole = async (req, res) => {
  const id = req.params.id;
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
};

// POST /admin/users/:id/status
module.exports.updateStatus = async (req, res) => {
  const id = req.params.id;
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
};

// POST /admin/users/:id/delete
module.exports.softDelete = async (req, res) => {
  const id = req.params.id;

  await Nguoidung.updateOne(
    { _id: id, daxoa: { $ne: true } },
    { $set: { daxoa: true, ngaycapnhat: new Date() } }
  );

  req.flash('success', 'Đã xóa (mềm) tài khoản');
  return res.redirect('/admin/users');
};

// POST /admin/users/:id/update
module.exports.updateFromDetail = async (req, res) => {
  const id = req.params.id;

  const hoten = normalizeString(req.body.hoten);
  const sodienthoai = normalizeString(req.body.sodienthoai);
  const diachi = normalizeString(req.body.diachi);
  const gioitinh = normalizeString(req.body.gioitinh);
  const avatar = normalizeString(req.body.avatar);
  const ngaysinh = parseOptionalDate(req.body.ngaysinh);

  const vaitro = normalizeString(req.body.vaitro);
  const trangthai = normalizeString(req.body.trangthai);

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
};

// POST /admin/users/:id/password
module.exports.setPasswordFromDetail = async (req, res) => {
  const id = req.params.id;
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
};

// POST /admin/users/:id/restore
module.exports.restoreFromDetail = async (req, res) => {
  const id = req.params.id;
  await Nguoidung.updateOne(
    { _id: id },
    { $set: { daxoa: false, ngaycapnhat: new Date() } }
  );
  req.flash('success', 'Đã khôi phục tài khoản');
  return res.redirect(backToDetailOrList(req, id));
};
