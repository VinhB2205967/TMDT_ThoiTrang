const systemConfig = require('../../config/system');
const dashboardRoutes = require('./dashboard_route');

module.exports =(app)=>{
    const PATH_ADMIN = systemConfig.prefigAdmin;
    app.use(PATH_ADMIN + '/dashboard', dashboardRoutes);   
}