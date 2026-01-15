const systemConfig = require('../config/system');
const Nguoidung = require('../models/user_model');

function attachUserToLocals(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = Boolean(req.user);
  res.locals.isAdmin = Boolean(req.user && req.user.vaitro === 'admin');
  res.locals.adminPath = systemConfig.prefigAdmin;
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
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
  if (req.user && req.user.vaitro === 'admin') return next();

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

module.exports = {
  attachUserToLocals,
  requireAuth,
  requireAdmin,
  redirectAfterLogin,
  trackOnline
};
