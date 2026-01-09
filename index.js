const express = require('express')
const app = express()
require('dotenv').config()
const database = require("./config/database")
const route = require('./routes/client/index_route')
const routeAdmin = require('./routes/admin/index_route')
const systemConfig = require('./config/system')
const port = process.env.PORT
database.connect();
app.set('views', './views')
app.set('view engine', 'pug')
app.use(express.static('public'))

app.locals.prefigAdmin = systemConfig.prefigAdmin;
app.locals.admin = systemConfig.admin;
// router
routeAdmin(app);
route(app);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
