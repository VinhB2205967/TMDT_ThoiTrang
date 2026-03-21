const reportsAdminService = require('../../../services/content/admin-reports.service.js');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.duLieuBaoCao = async (req, res) => {
  try {
    const data = await reportsAdminService.getDuLieuBaoCao(req.query || {});
    return traJsonThanhCong(res, { status: 200, data });
  } catch (error) {
    console.error('reports.api.duLieuBaoCao error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'REPORTS_DATA_FAILED',
      message: 'Khong the tai du lieu bao cao'
    });
  }
};
