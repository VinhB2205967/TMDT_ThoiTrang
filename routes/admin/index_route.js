const systemConfig = require('../../config/system');
const dashboardRoutes = require('./dashboard_route');
const productsdRoutes = require('./products_route');
const importsRoutes = require('./imports_route');
const ordersRoutes = require('./orders_route');
const reviewsRoutes = require('./reviews_route');
const authRoutes = require('./auth_route');
const usersRoutes = require('./users_route');
const reportsRoutes = require('./reports_route');
const vouchersRoutes = require('./vouchers_route');
const bannersRoutes = require('./banners_route');
const homeSectionsRoutes = require('./home_sections_route');
const flashSalesRoutes = require('./flash_sales_route');
const lookbooksRoutes = require('./lookbooks_route');
const brandsRoutes = require('./brands_route');
const categoriesRoutes = require('./categories_route');
const blogRoutes = require('./blog_route');
const chatRoutes = require('./chat_route');
const { requireAdmin } = require('../../middlewares/auth');
module.exports =(app)=>{
    const PATH_ADMIN = systemConfig.prefigAdmin;
    // Admin auth pages (no requireAdmin)
    app.use(PATH_ADMIN, authRoutes);

    // Protect all remaining admin routes
    app.use(PATH_ADMIN, requireAdmin);
    app.use(PATH_ADMIN + '/', dashboardRoutes);
    app.use(PATH_ADMIN + '/dashboard', dashboardRoutes);  
    app.use(PATH_ADMIN + '/products', productsdRoutes); 
    app.use(PATH_ADMIN + '/imports', importsRoutes);
    app.use(PATH_ADMIN + '/orders', ordersRoutes);
    app.use(PATH_ADMIN + '/reviews', reviewsRoutes);
    app.use(PATH_ADMIN + '/users', usersRoutes);
    app.use(PATH_ADMIN + '/reports', reportsRoutes);
    app.use(PATH_ADMIN + '/vouchers', vouchersRoutes);
    app.use(PATH_ADMIN + '/banners', bannersRoutes);
    app.use(PATH_ADMIN + '/home-sections', homeSectionsRoutes);
    app.get(PATH_ADMIN + '/settings/home', (req, res) => res.redirect(PATH_ADMIN + '/home-sections'));
    app.use(PATH_ADMIN + '/flash-sales', flashSalesRoutes);
    app.use(PATH_ADMIN + '/lookbooks', lookbooksRoutes);
    app.use(PATH_ADMIN + '/lookbook', lookbooksRoutes);
    app.use(PATH_ADMIN + '/brands', brandsRoutes);
    app.use(PATH_ADMIN + '/categories', categoriesRoutes);
    app.use(PATH_ADMIN + '/category', categoriesRoutes);
    app.use(PATH_ADMIN + '/blog', blogRoutes);
    app.use(PATH_ADMIN + '/chats', chatRoutes);
}