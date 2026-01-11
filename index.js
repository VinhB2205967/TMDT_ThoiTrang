const express = require('express')
const app = express()
require('dotenv').config()
const flash = require('express-flash')
const session = require('express-session')
const database = require("./config/database")
const route = require('./routes/client/index_route')
const routeAdmin = require('./routes/admin/index_route')
const systemConfig = require('./config/system')
const port = process.env.PORT
database.connect();
app.set('views', './views')
app.set('view engine', 'pug')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Session & Flash
app.use(session({
    secret: process.env.SESSION_SECRET || 'fashion-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 }
}))
app.use(flash())

app.locals.prefigAdmin = systemConfig.prefigAdmin;
app.locals.admin = systemConfig.admin;
// router
routeAdmin(app);
route(app);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
