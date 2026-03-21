const categoriesService = require('../../services/catalog/admin-categories.service.js');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function xuLyKetQuaSSR(req, res, result) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, '/admin/categories');
}

module.exports.danhSach = async (req, res) => {
  const viewData = await categoriesService.getDanhSachData(req.query || {});
  res.render('admin/pages/categories/index.pug', viewData);
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await categoriesService.taoDanhMuc(req.body || {});
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: `Không thể tạo danh mục: ${error.message}` });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await categoriesService.capNhatDanhMuc(req.params.id, req.body || {});
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: `Không thể cập nhật danh mục: ${error.message}` });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await categoriesService.xoaDanhMuc(req.params.id);
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: `Không thể xóa danh mục: ${error.message}` });
  }
};

module.exports.doiTrangThai = async (req, res) => {
  try {
    const result = await categoriesService.doiTrangThaiDanhMuc(req.params.id);
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: `Không thể cập nhật trạng thái: ${error.message}` });
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const result = await categoriesService.sapXepDanhMuc(items);
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: `Không thể sắp xếp danh mục: ${error.message}` });
  }
};
