const dashboardService = require('../../../services/content/admin-dashboard.service.js');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.hoiTroAI = async (req, res) => {
  try {
    const result = await dashboardService.askAdminAssistant({
      question: req.body && req.body.question,
      provider: req.body && req.body.provider,
      model: req.body && req.body.model,
      history: req.body && req.body.history
    });

    if (!result.ok) {
      return traJsonThatBai(res, {
        status: result.status || 400,
        code: 'AI_ASSISTANT_INVALID',
        message: result.message || 'Dữ liệu không hợp lệ'
      });
    }

    return traJsonThanhCong(res, {
      status: result.status || 200,
      data: result.data
    });
  } catch (error) {
    const selectedProvider = String(req.body && req.body.provider ? req.body.provider : 'ollama').trim().toLowerCase() || 'ollama';
    const mappedError = dashboardService.mapAdminAiError(error, selectedProvider);

    if ((mappedError.status || 500) >= 500) {
      console.error('Admin AI assistant error:', error);
    }

    return traJsonThatBai(res, {
      status: mappedError.status || 500,
      code: 'AI_ASSISTANT_ERROR',
      message: mappedError.message
    });
  }
};
