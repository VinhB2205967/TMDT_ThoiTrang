const dashboardService = require('../../services/content/admin-dashboard.service.js');

module.exports.bangDieuKhien = async (req, res) => {
  try {
    const viewData = await dashboardService.getDashboardPageData();
    res.render('admin/pages/dashboard/index.pug', viewData);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('admin/pages/dashboard/index.pug', dashboardService.getDashboardFallbackData());
  }
};

module.exports.trangAITroLy = async (req, res) => {
  return res.render('admin/pages/dashboard/ai_assistant.pug', dashboardService.getAiAssistantPageData());
};
