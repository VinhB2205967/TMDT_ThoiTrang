const bannersService = require('../../services/content/admin-banners.service');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function xuLyKetQuaSSR(req, res, result) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, '/admin/banners');
}

module.exports.danhSach = async (req, res) => {
  try {
    const result = await bannersService.layDanhSachBanner();
    return res.render('admin/pages/home/banners.pug', {
      titlePage: 'Quản lý Banner',
      banners: result.data,
      bannerTypes: result.meta.bannerTypes,
      ctaLinkSuggestions: result.meta.ctaLinkSuggestions
    });
  } catch (error) {
    console.error('banners.danhSach error:', error);
    return res.status(500).send('Không thể tải danh sách banner');
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await bannersService.taoBanner({ body: req.body || {}, file: req.file });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await bannersService.capNhatBanner({ id: req.params.id, body: req.body || {}, file: req.file });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await bannersService.xoaBanner({ id: req.params.id });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};

module.exports.batTat = async (req, res) => {
  try {
    const result = await bannersService.batTatBanner({ id: req.params.id });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};
