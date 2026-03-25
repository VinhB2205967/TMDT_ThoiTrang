const { muonJSON } = require('../helpers/http');

function registerErrorHandlers(app, options) {
  const { adminPath } = options;

  app.use((err, req, res, next) => {
    if (err && err.code === 'EBADCSRFTOKEN') {
      const message = 'Phi\u00ean l\u00e0m vi\u1ec7c \u0111\u00e3 h\u1ebft h\u1ea1n. Vui l\u00f2ng t\u1ea3i l\u1ea1i trang.';
      const contentTypeHeader = String(req.get('content-type') || '').toLowerCase();
      const isApiRequest = muonJSON(req) || contentTypeHeader.includes('application/json');

      if (isApiRequest) {
        return res.status(403).json({ success: false, message });
      }
      if (req.flash) req.flash('error', message);
      return res.redirect(req.get('Referrer') || '/');
    }

    console.error('Unhandled error:', err);
    const message = 'C\u00f3 l\u1ed7i x\u1ea3y ra. Vui l\u00f2ng th\u1eed l\u1ea1i sau.';
    if (req.accepts('json')) {
      return res.status(500).json({ success: false, message });
    }
    return res.status(500).send(message);
  });

  // 404 handler (must be after all routes)
  app.use((req, res) => {
    const isAdminPath = req.path && req.path.startsWith(adminPath);
    if (isAdminPath) {
      return res.status(404).render('admin/pages/errors/404.pug', {
        titlePage: '404 - Kh\u00f4ng t\u00ecm th\u1ea5y'
      });
    }
    return res.status(404).render('client/pages/errors/404.pug', {
      titlePage: '404 - Kh\u00f4ng t\u00ecm th\u1ea5y'
    });
  });
}

module.exports = {
  registerErrorHandlers
};
