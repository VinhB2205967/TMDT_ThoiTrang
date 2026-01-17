const productsRoutes = require('./products_route');
const homeRoutes = require('./home_route');
const favoritesRoutes = require('./favorites_route');
const authRoutes = require('./auth_route');
const accountRoutes = require('./account_route');
const cartRoutes = require('./cart_route');
const ordersRoutes = require('./orders_route');

module.exports = (app) => {
    app.use('/', homeRoutes);
    app.use('/products', productsRoutes);
    app.use('/favorites', favoritesRoutes);
    app.use('/cart', cartRoutes);
    app.use('/orders', ordersRoutes);
    app.use('/', authRoutes);
    app.use('/', accountRoutes);
}