const express = require('express')
const app = express()
require('dotenv').config()
const flash = require('express-flash')
const session = require('express-session')
const MongoStore = require('connect-mongo').default
const cookieParser = require('cookie-parser')
const mongoSanitize = require('./middlewares/mongoSanitize')
const passport = require('passport')
const { configurePassport } = require('./config/passport')
const { attachUserToLocals, trackOnline } = require('./middlewares/auth')
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
app.set('views', './views')
app.set('view engine', 'pug')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Read cookies (used for "remember email" on auth page)
app.use(cookieParser())

// Prevent MongoDB operator injection via req.body/query/params
app.use(mongoSanitize())

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

// Flash uses whichever session was attached above
app.use(flash())

app.use(passport.initialize())
app.use(passport.session())
app.use(attachUserToLocals)
app.use(trackOnline)

app.locals.prefigAdmin = systemConfig.prefigAdmin;
app.locals.admin = systemConfig.admin;
// router
routeAdmin(app);
route(app);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
