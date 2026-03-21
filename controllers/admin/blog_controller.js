const blogService = require('../../services/content/admin-blog.service');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function xuLyKetQuaSSR(req, res, result) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, '/admin/blog');
}

module.exports.danhSach = async (req, res) => {
  try {
    const result = await blogService.layDanhSachBaiViet();
    return res.render('admin/pages/blog/blog.pug', {
      titlePage: 'Quản lý Blog',
      posts: result.data
    });
  } catch (error) {
    console.error('blog.danhSach error:', error);
    return res.status(500).send('Không thể tải danh sách blog');
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await blogService.taoBaiViet({ body: req.body || {}, file: req.file });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await blogService.capNhatBaiViet({ id: req.params.id, body: req.body || {}, file: req.file });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await blogService.xoaBaiViet({ id: req.params.id });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};

module.exports.capNhatXuatBan = async (req, res) => {
  try {
    const result = await blogService.capNhatXuatBan({ id: req.params.id, body: req.body || {} });
    return xuLyKetQuaSSR(req, res, result);
  } catch (error) {
    return xuLyKetQuaSSR(req, res, { ok: false, message: error.message });
  }
};
