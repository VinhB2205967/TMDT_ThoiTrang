const homeSectionsService = require('../../services/content/admin-home-sections.service.js');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');
const { layCauHinhHeaderClient } = require('../../services/content/client-header-settings.service');

function xuLyKetQuaSSR(req, res, result) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, '/admin/home-sections');
}

module.exports.danhSach = async (req, res) => {
  const [result, headerSettings] = await Promise.all([
    homeSectionsService.layDanhSachHomeSections(),
    layCauHinhHeaderClient().catch(() => ({ name: 'Fashion Store', logo: '' }))
  ]);

  return res.render('admin/pages/home/home_sections.pug', {
    titlePage: 'Quản lý Trang chủ',
    sections: result.data || [],
    headerSettings
  });
};

module.exports.capNhat = async (req, res) => {
  const result = await homeSectionsService.capNhatHomeSection({ key: req.params.key, body: req.body || {} });
  return xuLyKetQuaSSR(req, res, result);
};

module.exports.batTat = async (req, res) => {
  const result = await homeSectionsService.batTatHomeSection({ key: req.params.key });
  return xuLyKetQuaSSR(req, res, result);
};

module.exports.sapXep = async (req, res) => {
  const result = await homeSectionsService.sapXepHomeSections({ items: Array.isArray(req.body.items) ? req.body.items : [] });
  return xuLyKetQuaSSR(req, res, result);
};
