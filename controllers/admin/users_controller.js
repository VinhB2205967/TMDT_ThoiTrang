const Nguoidung = require('../../models/user_model');

function normalizeKeyword(keyword) {
  return String(keyword || '').trim();
}

function isOnline(lastSeenAt, windowMs) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= windowMs;
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
