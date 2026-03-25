const clientRoutes = require('../routes/client/index_route');
const adminRoutes = require('../routes/admin/index_route');

function registerRoutes(app, options) {
  const { authLimiter, adminPath, adminAlias } = options;

  app.locals.prefigAdmin = adminPath;
  app.locals.admin = adminAlias;
  app.use('/auth', authLimiter);
  app.use(`${adminPath}/login`, authLimiter);

  adminRoutes(app);
  clientRoutes(app);

  app.get('/search', (req, res) => {
    res.send(`<h1>K\u1ebft qu\u1ea3: ${req.query.q}</h1>`);
  });

  app.get('/check-proto', (req, res) => {
    res.json({
      polluted: {}.isAdmin === true
    });
  });
}

module.exports = {
  registerRoutes
};
