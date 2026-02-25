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
}