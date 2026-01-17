const systemConfig = require('../config/system');
const Nguoidung = require('../models/user_model');

function wantsJSON(req) {
  const accept = String(req.headers.accept || '');
  return req.xhr || accept.includes('application/json') || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
}

function attachUserToLocals(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = Boolean(req.user);
  res.locals.isAdmin = Boolean(req.user && req.user.vaitro === 'admin');
  res.locals.adminPath = systemConfig.prefigAdmin;
  next();
}

function requireAuth(req, res, next) {
  if (req.user && req.user.trangthai === 'active') return next();
  if (req.user && req.user.trangthai !== 'active') {
    // If user was deactivated while logged in, force logout.
    try {
      req.logout(() => {});
    } catch {}
  }
  if (wantsJSON(req)) {
    return res.status(401).json({
      success: false,
      message: 'Bạn cần đăng nhập',
      redirect: '/auth?mode=login'
    });
  }
  return res.redirect('/auth?mode=login');
}

function requireAdmin(req, res, next) {
  const adminPath = systemConfig.prefigAdmin;

  // Prefer separate admin session if present
  const adminUserId = req.session && req.session.adminUserId;
  if (adminUserId) {
    return Nguoidung.findOne({ _id: adminUserId, daxoa: { $ne: true } })
      .then((adminUser) => {
        if (adminUser && adminUser.vaitro === 'admin' && adminUser.trangthai === 'active') {
          req.adminUser = adminUser;
          res.locals.adminUser = adminUser;
          return next();
        }
        if (req.session) delete req.session.adminUserId;
        return res.redirect(`${adminPath}/login`);
      })
      .catch(() => res.redirect(`${adminPath}/login`));
  }

  // Fallback: if user is logged in via client passport session and is admin
  if (req.user && req.user.vaitro === 'admin' && req.user.trangthai === 'active') return next();

  return res.redirect(`${adminPath}/login`);
}

function redirectAfterLogin(user, res) {
  if (user && user.vaitro === 'admin') {
    return res.redirect(systemConfig.prefigAdmin);
  }
  return res.redirect('/');
}

function touchUserLastSeen(userId) {
  if (!userId) return;
  // Fire-and-forget; avoid blocking request.
  Nguoidung.updateOne(
    { _id: userId, daxoa: { $ne: true } },
    { $set: { lastSeenAt: new Date() } }
  ).catch(() => {});
}

function trackOnline(req, res, next) {
  if (req.user && req.user._id) touchUserLastSeen(req.user._id);
  if (req.session && req.session.adminUserId) touchUserLastSeen(req.session.adminUserId);
  next();
}

function enforceActiveSessions(req, res, next) {
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
    const adminPath = systemConfig.prefigAdmin;
    // Only enforce inside /admin to avoid querying DB on every client page
    if (req.path && req.path.startsWith(adminPath)) {
      const adminUserId = req.session.adminUserId;
      return Nguoidung.findOne({ _id: adminUserId, daxoa: { $ne: true } })
        .lean()
        .then((u) => {
          if (!u || u.vaitro !== 'admin' || u.trangthai !== 'active') {
            delete req.session.adminUserId;
            req.flash?.('error', 'Tài khoản Admin đang bị khóa');
            return res.redirect(`${adminPath}/login`);
          }
          return next();
        })
        .catch(() => {
          delete req.session.adminUserId;
          return res.redirect(`${adminPath}/login`);
        });
    }
  }

  return next();
}

module.exports = {
  attachUserToLocals,
  requireAuth,
  requireAdmin,
  redirectAfterLogin,
  trackOnline,
  enforceActiveSessions
};
