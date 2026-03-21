const brandsService = require('../../services/catalog/admin-brands.service');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function xuLyKetQuaSSR(req, res, result) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, '/admin/brands');
}

module.exports.danhSach = async (req, res) => {
  const result = await brandsService.layDanhSachThuongHieu();
  return res.render('admin/pages/home/brands.pug', {
    titlePage: 'Quản lý Thương hiệu',
    brands: result.data || []
  });
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await brandsService.taoThuongHieu({ body: req.body || {}, file: req.file });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: `Không thể tạo thương hiệu: ${error.message}` });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await brandsService.capNhatThuongHieu({ id: req.params.id, body: req.body || {}, file: req.file });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: `Không thể cập nhật thương hiệu: ${error.message}` });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await brandsService.xoaThuongHieu({ id: req.params.id });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: `Không thể xóa thương hiệu: ${error.message}` });
  }
};

module.exports.capNhatNoiBat = async (req, res) => {
  try {
    const result = await brandsService.capNhatNoiBat({ id: req.params.id, body: req.body || {} });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};

module.exports.capNhatHienThi = async (req, res) => {
  try {
    const result = await brandsService.capNhatHienThi({ id: req.params.id, body: req.body || {} });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const result = await brandsService.sapXepThuongHieu({ items: Array.isArray(req.body.items) ? req.body.items : [] });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};
