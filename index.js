const express = require('express')
const app = express()
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')
require('dotenv').config()
const flash = require('express-flash')
const session = require('express-session')
const MongoStore = require('connect-mongo').default
const cookieParser = require('cookie-parser')
const mongoSanitize = require('./middlewares/mongoSanitize')
const xssSanitize = require('./middlewares/xssSanitize')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const csrf = require('csurf')
const passport = require('passport')
const { configurePassport } = require('./config/passport')
const { attachUserToLocals, trackOnline, enforceActiveSessions } = require('./middlewares/auth')
const { attachCartCount } = require('./middlewares/cart')
const { attachFavoriteCount } = require('./middlewares/favorites')
const { attachCategoryMenu } = require('./middlewares/categories')
const { seedAdminOnConnect } = require('./services/seedAdmin')
const database = require("./config/database")
const route = require('./routes/client/index_route')
const routeAdmin = require('./routes/admin/index_route')
const systemConfig = require('./config/system')
const { setupChatSocket } = require('./socketio/chat.socket')
const { prewarmOpenClipWorker } = require('./services/catalog/openClip.service.js')
const { ganCauHinhHeaderClient } = require('./middlewares/client-header-settings')
const port = process.env.PORT
database.connect();
const httpServer = http.createServer(app)

function patchSessionStore(store, label) {
  if (!store) return;

  if (typeof store.touch === 'function') {
    const originalTouch = store.touch.bind(store);
    store.touch = function safeTouch(sid, sess, cb) {
      const done = typeof cb === 'function' ? cb : function noop() {};
      return originalTouch(sid, sess, function onTouched(err) {
        if (err && /Unable to find the session to touch/i.test(String(err.message || ''))) {
          // Session may have expired/been removed between request start and response finish.
          return done(null);
        }
        return done(err);
      });
    };
  }

  if (typeof store.on === 'function') {
    store.on('error', (error) => {
      console.error(`[session:${label}]`, error);
    });
  }
}

// Auth setup
configurePassport();
seedAdminOnConnect();
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')
app.disable('x-powered-by')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(express.json({ limit: '1mb' }))

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}))

const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    if (!origin || allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

const enableRateLimit = String(
  process.env.ENABLE_RATE_LIMIT
  || (process.env.NODE_ENV === 'production' ? 'true' : 'false')
).toLowerCase() === 'true';

if (enableRateLimit) {
  app.use(limiter);
}

// Read cookies (used for "remember email" on auth page)
app.use(cookieParser())

// Prevent MongoDB operator injection via req.body/query/params/headers
app.use(mongoSanitize({ strict: true }))
app.use(xssSanitize())

// Session (separate cookies for admin vs client)
const sessionStoreClient = MongoStore.create({
  mongoUrl: process.env.MONGODB_URL,
  collectionName: 'sessions',
  ttl: 7 * 24 * 60 * 60
});

const sessionStoreAdmin = MongoStore.create({
  mongoUrl: process.env.MONGODB_URL,
  collectionName: 'admin_sessions',
  ttl: 7 * 24 * 60 * 60
});

patchSessionStore(sessionStoreClient, 'client');
patchSessionStore(sessionStoreAdmin, 'admin');

const clientSession = session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'fashion-secret-key',
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
  secret: process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || 'fashion-admin-secret-key',
  resave: false,
  saveUninitialized: false,
  store: sessionStoreAdmin,
  cookie: {
    path: systemConfig.prefigAdmin,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
});

app.use((req, res, next) => {
  if (req.path && req.path.startsWith(systemConfig.prefigAdmin)) {
    return adminSession(req, res, next);
  }
  return clientSession(req, res, next);
});

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
app.use(flash())
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
})

app.use(passport.initialize())
app.use(passport.session())
app.use(enforceActiveSessions)
app.use(attachUserToLocals)
app.use(attachCartCount)
app.use(attachFavoriteCount)
app.use(attachCategoryMenu)
app.use(ganCauHinhHeaderClient)
app.use(trackOnline)

app.locals.prefigAdmin = systemConfig.prefigAdmin;
app.locals.admin = systemConfig.admin;
if (enableRateLimit) {
  app.use('/auth', authLimiter);
  app.use(systemConfig.prefigAdmin + '/login', authLimiter);
}

// router
routeAdmin(app);
route(app);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err && err.code === 'EBADCSRFTOKEN') {
    const message = 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang.';
    const acceptHeader = String(req.get('accept') || '').toLowerCase();
    const contentTypeHeader = String(req.get('content-type') || '').toLowerCase();
    const isApiRequest =
      req.xhr
      || String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest'
      || acceptHeader.includes('application/json')
      || contentTypeHeader.includes('application/json');

    if (isApiRequest) {
      return res.status(403).json({ success: false, message });
    }
    if (req.flash) req.flash('error', message);
    return res.redirect(req.get('Referrer') || '/');
  }
  console.error('Unhandled error:', err);
  const message = 'Có lỗi xảy ra. Vui lòng thử lại sau.';
  if (req.accepts('json')) {
    return res.status(500).json({ success: false, message });
  }
  return res.status(500).send(message);
});
app.get("/search", (req, res) => {
  res.send(`<h1>Kết quả: ${req.query.q}</h1>`);
});
app.get("/check-proto", (req, res) => {
  res.json({
    polluted: {}.isAdmin === true
  });
});
// 404 handler (must be after all routes)
app.use((req, res) => {
  const isAdminPath = req.path && req.path.startsWith(systemConfig.prefigAdmin);
  if (isAdminPath) {
    return res.status(404).render('admin/pages/errors/404.pug', {
      titlePage: '404 - Không tìm thấy'
    });
  }
  return res.status(404).render('client/pages/errors/404.pug', {
    titlePage: '404 - Không tìm thấy'
  });
});

const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true
  }
})

setupChatSocket(io)

httpServer.listen(port, () => {
  console.log(`Example app listening on port ${port}`)

  // Warm OpenCLIP worker in background so first image-search request is faster.
  setImmediate(async () => {
    try {
      const prewarm = await prewarmOpenClipWorker()
      if (prewarm && prewarm.ok) {
        console.log(`OpenCLIP prewarm ready (${prewarm.pythonBin})`)
      } else {
        console.warn('OpenCLIP prewarm skipped/fail:', prewarm)
      }
    } catch (error) {
      console.warn('OpenCLIP prewarm failed:', error && error.message ? error.message : error)
    }
  })
})
