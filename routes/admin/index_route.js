const systemConfig = require('../../config/system');
const dashboardRoutes = require('./dashboard_route');
const productsdRoutes = require('./products_route');
const authRoutes = require('./auth_route');
const usersRoutes = require('./users_route');
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
    app.use(PATH_ADMIN + '/users', usersRoutes);
}