const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const flash = require('express-flash');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const mongoSanitize = require('../middlewares/mongoSanitize');
const xssSanitize = require('../middlewares/xssSanitize');
const {
  attachUserToLocals,
  trackOnline,
  enforceActiveSessions
} = require('../middlewares/auth');
const { attachCartCount } = require('../middlewares/cart');
const { attachFavoriteCount } = require('../middlewares/favorites');
const { attachCategoryMenu } = require('../middlewares/categories');
const { ganCauHinhHeaderClient } = require('../middlewares/client-header-settings');
const { configurePassport } = require('../config/passport');
const { seedAdminOnConnect } = require('../services/seedAdmin');
const systemConfig = require('../config/system');
const { createRateLimiters } = require('./rate-limit');
const { createSessionSelector } = require('./session');
const { registerRoutes } = require('./routes');
const { registerErrorHandlers } = require('./errors');

function applyFlashSafetyWrapper(app) {
  app.use((req, res, next) => {
    const rawFlash = typeof req.flash === 'function' ? req.flash.bind(req) : null;

    req.flash = function safeFlash(type, message) {
      if (!rawFlash) return [];
      try {
        if (typeof type === 'undefined') return rawFlash();
        if (typeof message === 'undefined') return rawFlash(type);
        return rawFlash(type, message);
      } catch (error) {
        // Keep request alive when flash is called without an attached session.
        if (error && /requires sessions/i.test(String(error.message || ''))) {
          return [];
        }
        throw error;
      }
    };

    next();
  });
}

function createApp() {
  configurePassport();
  seedAdminOnConnect();

  const app = express();
  const rootDir = path.join(__dirname, '..');

  app.set('views', path.join(rootDir, 'views'));
  app.set('view engine', 'pug');
  app.disable('x-powered-by');
  app.use(express.static(path.join(rootDir, 'public')));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com'
        ],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'data:', 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        // Keep local HTTP development stable; enable this later when forcing HTTPS everywhere.
        upgradeInsecureRequests: null
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  const allowedOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));

  const { limiter, authLimiter } = createRateLimiters();
  app.use(limiter);

  // Read cookies (used for "remember email" on auth page)
  app.use(cookieParser());

  // Prevent MongoDB operator injection via req.body/query/params/headers
  app.use(mongoSanitize({ strict: true }));
  app.use(xssSanitize());

  const attachSessionByPath = createSessionSelector({
    mongoUrl: process.env.MONGODB_URL,
    adminPath: systemConfig.prefigAdmin,
    sessionSecret: process.env.SESSION_SECRET,
    adminSessionSecret: process.env.ADMIN_SESSION_SECRET
  });
  app.use(attachSessionByPath);

  const csrfProtection = csrf({ cookie: false });
  app.use(csrfProtection);
  app.use((req, res, next) => {
    try {
      res.locals.csrfToken = req.csrfToken();
    } catch {
      res.locals.csrfToken = '';
    }
    next();
  });

  // Flash uses whichever session was attached above
  app.use(flash());
  applyFlashSafetyWrapper(app);

  app.use(passport.initialize());
  app.use(passport.session());
  app.use(enforceActiveSessions);
  app.use(attachUserToLocals);
  app.use(attachCartCount);
  app.use(attachFavoriteCount);
  app.use(attachCategoryMenu);
  app.use(ganCauHinhHeaderClient);
  app.use(trackOnline);

  registerRoutes(app, {
    authLimiter,
    adminPath: systemConfig.prefigAdmin,
    adminAlias: systemConfig.admin
  });
  registerErrorHandlers(app, { adminPath: systemConfig.prefigAdmin });

  return app;
}

module.exports = {
  createApp
};
