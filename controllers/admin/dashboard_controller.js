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

module.exports.hoiTroAI = async (req, res) => {
  try {
    const result = await dashboardService.askAdminAssistant({
      question: req.body && req.body.question,
      provider: req.body && req.body.provider,
      model: req.body && req.body.model,
      history: req.body && req.body.history
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message || 'Dữ liệu không hợp lệ' });
    }

    return res.status(result.status || 200).json({ success: true, data: result.data });
  } catch (error) {
    const selectedProvider = String(req.body && req.body.provider ? req.body.provider : 'ollama').trim().toLowerCase() || 'ollama';
    const mappedError = dashboardService.mapAdminAiError(error, selectedProvider);

    if ((mappedError.status || 500) >= 500) {
      console.error('Admin AI assistant error:', error);
    }

    return res.status(mappedError.status || 500).json({ success: false, message: mappedError.message });
  }
};
