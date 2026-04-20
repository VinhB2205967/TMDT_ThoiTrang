const lookbooksService = require('../../services/content/admin-lookbooks.service');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function xuLyKetQuaSSR(req, res, result) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, '/admin/lookbook');
}

function pickImageFile(req) {
  if (req && req.file) return req.file;
  if (req && req.files && Array.isArray(req.files.image) && req.files.image[0]) return req.files.image[0];
  return null;
}

module.exports.danhSach = async (req, res) => {
  const result = await lookbooksService.layDanhSachLookbookData();

  return res.render('admin/pages/lookbooks/index.pug', {
    titlePage: 'Quản lý Lookbook',
    lookbooks: result.data || []
  });
};

module.exports.trangTaoMoi = async (req, res) => {
  const result = await lookbooksService.getTrangTaoData();
  return res.render('admin/pages/lookbooks/form.pug', {
    titlePage: 'Thêm Lookbook',
    mode: 'create',
    lookbook: result.data.lookbook,
    products: result.data.products,
    errors: result.data.errors
  });
};

module.exports.taoMoi = async (req, res) => {
  const result = await lookbooksService.taoLookbook({
    body: req.body || {},
    file: pickImageFile(req),
    files: req.files || {}
  });
  if (!result.ok) {
    const fallback = await lookbooksService.getTrangTaoData();
    return res.status(400).render('admin/pages/lookbooks/form.pug', {
      titlePage: 'Thêm Lookbook',
      mode: 'create',
      lookbook: result.data || fallback.data.lookbook,
      products: fallback.data.products,
      errors: result.errors || [result.message || 'Dữ liệu không hợp lệ']
    });
  }

  req.flash('success', 'Tạo lookbook thành công');
  return res.redirect('/admin/lookbook');
};

module.exports.trangChinhSua = async (req, res) => {
  const result = await lookbooksService.getTrangChinhSuaData(req.params.id);
  if (!result.ok) {
    return res.status(404).render('admin/pages/errors/404.pug', { titlePage: 'Không tìm thấy Lookbook' });
  }

  return res.render('admin/pages/lookbooks/form.pug', {
    titlePage: 'Chỉnh sửa Lookbook',
    mode: 'edit',
    lookbook: result.data.lookbook,
    products: result.data.products,
    errors: result.data.errors
  });
};

module.exports.capNhat = async (req, res) => {
  const result = await lookbooksService.capNhatLookbook({
    id: req.params.id,
    body: req.body || {},
    file: pickImageFile(req),
    files: req.files || {}
  });
  if (result.status === 404) {
    return res.status(404).render('admin/pages/errors/404.pug', { titlePage: 'Không tìm thấy Lookbook' });
  }

  if (!result.ok) {
    const pageData = await lookbooksService.getTrangChinhSuaData(req.params.id);
    return res.status(400).render('admin/pages/lookbooks/form.pug', {
      titlePage: 'Chỉnh sửa Lookbook',
      mode: 'edit',
      lookbook: result.data || (pageData.ok ? pageData.data.lookbook : { _id: req.params.id }),
      products: pageData.ok ? pageData.data.products : [],
      errors: result.errors || [result.message || 'Dữ liệu không hợp lệ']
    });
  }

  req.flash('success', 'Cập nhật lookbook thành công');
  return res.redirect('/admin/lookbook');
};

module.exports.xoa = async (req, res) => {
  const result = await lookbooksService.xoaLookbook(req.params.id);
  return xuLyKetQuaSSR(req, res, result);
};

module.exports.batTat = async (req, res) => {
  const result = await lookbooksService.batTatLookbook(req.params.id);
  return xuLyKetQuaSSR(req, res, result);
};
