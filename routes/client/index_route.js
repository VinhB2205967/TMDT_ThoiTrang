const productsRoute = require('./products_route');
const homeRoute = require('./home_route');
module.exports =(app)=>{
    app.use('/', homeRoute);
    app.use('/products', productsRoute);
}