const productsRoutes = require('./products_route');
const homeRoutes = require('./home_route');
const favoritesRoutes = require('./favorites_route');
const authRoutes = require('./auth_route');
const accountRoutes = require('./account_route');
const cartRoutes = require('./cart_route');
const ordersRoutes = require('./orders_route');
const reviewsRoutes = require('./reviews_route');
const voucherRoutes = require('./voucher_route');
const apiRoutes = require('./api_route');
const lookbookRoutes = require('./lookbook_route');
const blogRoutes = require('./blog_route');
const brandsRoutes = require('./brands_route');
const openclipRoutes = require('./openclip_route');

module.exports = (app) => {
    app.use('/api', apiRoutes);
    app.use('/', homeRoutes);
    app.use('/products', productsRoutes);
    app.use('/lookbook', lookbookRoutes);
    app.use('/lookbooks', lookbookRoutes);
    app.use('/ai', openclipRoutes);
    app.use('/brands', brandsRoutes);
    app.use('/blog', blogRoutes);
    app.use('/favorites', favoritesRoutes);
    app.use('/cart', cartRoutes);
    app.use('/vouchers', voucherRoutes);
    app.use('/orders', ordersRoutes);
    app.use('/reviews', reviewsRoutes);
    app.use('/', authRoutes);
    app.use('/', accountRoutes);
}