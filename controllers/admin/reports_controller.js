const reportsAdminService = require('../../services/content/admin-reports.service.js');

module.exports.trangBaoCao = async (req, res) => {
  try {
    const viewData = await reportsAdminService.getTrangBaoCaoData();
    res.render('admin/pages/reports/index.pug', viewData);
  } catch (error) {
    console.error('reports.page error:', error);
    res.status(500).send('Không thể tải trang báo cáo.');
  }
};

module.exports.duLieuBaoCao = async (req, res) => {
  try {
    const data = await reportsAdminService.getDuLieuBaoCao(req.query || {});
    res.json(data);
  } catch (error) {
    console.error('reports data error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể tải dữ liệu báo cáo.'
    });
  }
};
