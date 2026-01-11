const systemConfig = require('../../config/system');
const dashboardRoutes = require('./dashboard_route');
const productsdRoutes = require('./products_route');
module.exports =(app)=>{
    const PATH_ADMIN = systemConfig.prefigAdmin;
    app.use(PATH_ADMIN + '/', dashboardRoutes);
    app.use(PATH_ADMIN + '/dashboard', dashboardRoutes);  
    app.use(PATH_ADMIN + '/products', productsdRoutes); 
}