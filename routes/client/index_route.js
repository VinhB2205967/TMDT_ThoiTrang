const productsRoutes = require('./products_route');
const homeRoutes = require('./home_route');
const favoritesRoutes = require('./favorites_route');

module.exports = (app) => {
    app.use('/', homeRoutes);
    app.use('/products', productsRoutes);
    app.use('/favorites', favoritesRoutes);
}