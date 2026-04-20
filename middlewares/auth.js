const systemConfig = require('../config/system');
const Nguoidung = require('../models/user_model');
const { layTKTheoId } = require('../services/account/index.js');

function muonJSON(req) {
  const chapNhan = String(req.headers.accept || '');
  return req.xhr || chapNhan.includes('application/json') || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
}

function ganNguoiDungVaoLocals(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = Boolean(req.user);
  res.locals.isAdmin = Boolean(req.user && req.user.vaitro === 'admin');
  res.locals.adminPath = systemConfig.prefigAdmin;
  next();
}

function yeuCauDangNhap(req, res, next) {
  if (req.user && req.user.trangthai === 'active') return next();
  if (req.user && req.user.trangthai !== 'active') {
    // If user was deactivated while logged in, force logout.
    try {
      req.logout(() => {});
    } catch {}
  }
  if (muonJSON(req)) {
    return res.status(401).json({
      success: false,
      message: 'Bạn cần đăng nhập',
      redirect: '/auth?mode=login'
    });
  }
  return res.redirect('/auth?mode=login');
}

function tuChoiAdminMuaHang(req, res, next) {
  if (!req.user || req.user.vaitro !== 'admin') return next();

  const message = 'Tài khoản admin không được phép mua hàng';
  if (muonJSON(req)) {
    return res.status(403).json({
      success: false,
      message,
      redirect: '/'
    });
  }

  req.flash?.('error', message);
  return res.redirect('/');
}

function yeuCauAdmin(req, res, next) {
  const duongDanAdmin = systemConfig.prefigAdmin;

  // Prefer separate admin session if present
  const idNguoiDungAdmin = req.session && req.session.adminUserId;
  if (idNguoiDungAdmin) {
    return Nguoidung.findOne({ _id: idNguoiDungAdmin, daxoa: { $ne: true } })
      .then((nguoiDungAdmin) => {
        if (!nguoiDungAdmin) {
          if (req.session) delete req.session.adminUserId;
          return res.redirect(`${duongDanAdmin}/login`);
        }

        return layTKTheoId({ userId: nguoiDungAdmin._id })
          .then((account) => {
            if (account) {
              nguoiDungAdmin.account = account;
              if (account.vaitro) nguoiDungAdmin.vaitro = account.vaitro;
              if (account.trangthai) nguoiDungAdmin.trangthai = account.trangthai;
            }

            if (nguoiDungAdmin.vaitro === 'admin' && nguoiDungAdmin.trangthai === 'active') {
              req.adminUser = nguoiDungAdmin;
              res.locals.adminUser = nguoiDungAdmin;
              return next();
            }

            if (req.session) delete req.session.adminUserId;
            return res.redirect(`${duongDanAdmin}/login`);
          })
          .catch(() => {
            if (req.session) delete req.session.adminUserId;
            return res.redirect(`${duongDanAdmin}/login`);
          });
      })
      .catch(() => res.redirect(`${duongDanAdmin}/login`));
  }

  // Fallback: if user is logged in via client passport session and is admin
  if (req.user && req.user.vaitro === 'admin' && req.user.trangthai === 'active') {
    req.adminUser = req.user;
    res.locals.adminUser = req.user;
    return next();
  }

  return res.redirect(`${duongDanAdmin}/login`);
}

function chuyenHuongSauDangNhap(user, res) {
  if (user && user.vaitro === 'admin') {
    return res.redirect(systemConfig.prefigAdmin);
  }
  return res.redirect('/');
}

function capNhatLanCuoiTruyCap(userId) {
  if (!userId) return;
  // Fire-and-forget; avoid blocking request.
  Nguoidung.updateOne(
    { _id: userId, daxoa: { $ne: true } },
    { $set: { lastSeenAt: new Date() } }
  ).catch(() => {});
}

function theoDoiTrucTuyen(req, res, next) {
  if (req.user && req.user._id) capNhatLanCuoiTruyCap(req.user._id);
  if (req.session && req.session.adminUserId) capNhatLanCuoiTruyCap(req.session.adminUserId);
  next();
}

function batBuocPhienHoatDong(req, res, next) {
  // Client passport session: logout immediately if noactive
  if (req.user && req.user.trangthai !== 'active') {
    const userId = req.user && req.user._id ? String(req.user._id) : null;
    if (userId) {
      const ONLINE_WINDOW_MS = 5 * 60 * 1000;
      const offlineAt = new Date(Date.now() - ONLINE_WINDOW_MS - 1000);
      Nguoidung.updateOne(
        { _id: userId, daxoa: { $ne: true } },
        { $set: { lastSeenAt: offlineAt } }
      ).catch(() => {});
    }

    // Avoid infinite loop: if already on auth pages, just clear session and continue
    const isAuthPage = req.path === '/auth' || req.path === '/login' || req.path === '/register' || req.path.startsWith('/auth/');
    try {
      req.logout(() => {});
    } catch {}

    if (!isAuthPage) {
      req.flash?.('error', 'Tài khoản đang bị khóa');
      return res.redirect('/auth?mode=login');
    }
  }

  // Admin session context: if adminUserId exists but user is no longer active/admin, clear.
  if (req.session && req.session.adminUserId) {
    const duongDanAdmin = systemConfig.prefigAdmin;
    // Only enforce inside /admin to avoid querying DB on every client page
    if (req.path && req.path.startsWith(duongDanAdmin)) {
      const idNguoiDungAdmin = req.session.adminUserId;
      return Nguoidung.findOne({ _id: idNguoiDungAdmin, daxoa: { $ne: true } })
        .lean()
        .then((u) => {
          if (!u) {
            delete req.session.adminUserId;
            req.flash?.('error', 'Tài khoản Admin đang bị khóa');
            return res.redirect(`${duongDanAdmin}/login`);
          }

          return layTKTheoId({ userId: u._id })
            .then((account) => {
              if (account) {
                u.account = account;
                if (account.vaitro) u.vaitro = account.vaitro;
                if (account.trangthai) u.trangthai = account.trangthai;
              }

              if (u.vaitro !== 'admin' || u.trangthai !== 'active') {
                delete req.session.adminUserId;
                req.flash?.('error', 'Tài khoản Admin đang bị khóa');
                return res.redirect(`${duongDanAdmin}/login`);
              }
              return next();
            })
            .catch(() => {
              delete req.session.adminUserId;
              return res.redirect(`${duongDanAdmin}/login`);
            });
        })
        .catch(() => {
          delete req.session.adminUserId;
          return res.redirect(`${duongDanAdmin}/login`);
        });
    }
  }

  return next();
}

module.exports = {
  // Giữ tương thích tên cũ
  attachUserToLocals: ganNguoiDungVaoLocals,
  requireAuth: yeuCauDangNhap,
  denyAdminPurchase: tuChoiAdminMuaHang,
  requireAdmin: yeuCauAdmin,
  redirectAfterLogin: chuyenHuongSauDangNhap,
  trackOnline: theoDoiTrucTuyen,
  enforceActiveSessions: batBuocPhienHoatDong,

  // Alias tiếng Việt
  ganNguoiDungVaoLocals,
  yeuCauDangNhap,
  tuChoiAdminMuaHang,
  yeuCauAdmin,
  chuyenHuongSauDangNhap,
  theoDoiTrucTuyen,
  batBuocPhienHoatDong
};

