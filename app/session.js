const session = require('express-session');
const MongoStore = require('connect-mongo').default;

function createSessionSelector(options) {
  const {
    mongoUrl,
    adminPath,
    sessionSecret,
    adminSessionSecret
  } = options;

  const sessionStoreClient = MongoStore.create({
    mongoUrl,
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60
  });

  const sessionStoreAdmin = MongoStore.create({
    mongoUrl,
    collectionName: 'admin_sessions',
    ttl: 7 * 24 * 60 * 60
  });

  const clientSession = session({
    name: 'sid',
    secret: sessionSecret || 'fashion-secret-key',
    resave: false,
    saveUninitialized: false,
    store: sessionStoreClient,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    }
  });

  const adminSession = session({
    name: 'admin.sid',
    secret: adminSessionSecret || sessionSecret || 'fashion-admin-secret-key',
    resave: false,
    saveUninitialized: false,
    store: sessionStoreAdmin,
    cookie: {
      path: adminPath,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    }
  });

  return (req, res, next) => {
    if (req.path && req.path.startsWith(adminPath)) {
      return adminSession(req, res, next);
    }
    return clientSession(req, res, next);
  };
}

module.exports = {
  createSessionSelector
};
