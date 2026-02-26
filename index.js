const express = require('express')
const app = express()
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
const port = process.env.PORT
database.connect();

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
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.use(limiter);

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

app.use(passport.initialize())
app.use(passport.session())
app.use(enforceActiveSessions)
app.use(attachUserToLocals)
app.use(attachCartCount)
app.use(attachFavoriteCount)
app.use(attachCategoryMenu)
app.use(trackOnline)

app.locals.prefigAdmin = systemConfig.prefigAdmin;
app.locals.admin = systemConfig.admin;
app.use('/auth', authLimiter);
app.use(systemConfig.prefigAdmin + '/login', authLimiter);

// router
routeAdmin(app);
route(app);

app.use((err, req, res, next) => {
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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
