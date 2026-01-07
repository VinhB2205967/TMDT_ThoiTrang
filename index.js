const express = require('express')
const app = express()
const route = require('./routes/client/index_route')
const port = 3000

app.set('views', './views')
app.set('view engine', 'pug')
app.use(express.static('public'))

route(app);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
