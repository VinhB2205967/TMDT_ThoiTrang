const sizeGuidesService = require('../../services/catalog/admin-size-guides.service.js');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function adminBase(req) {
  return req.app?.locals?.admin || '/admin';
}

function xuLyKetQuaSSR(req, res, result, fallback) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, fallback);
}

const danhSach = async (req, res) => {
  try {
    const result = await sizeGuidesService.getDanhSachData();
    return res.render('admin/pages/size-guides/index.pug', result.data);
  } catch (error) {
    console.error('Load size guides error:', error);
    return res.status(500).send('Không tải được danh sách bảng size');
  }
};

const taoMoi = async (req, res) => {
  const result = sizeGuidesService.getTaoMoiData();
  return res.render('admin/pages/size-guides/create.pug', result.data);
};

const taoMoiPost = async (req, res) => {
  try {
    const result = await sizeGuidesService.taoMoiGuide(req.body || {});
    return xuLyKetQuaSSR(req, res, result, `${adminBase(req)}/size-guides`);
  } catch (error) {
    console.error('Create size guide error:', error);
    req.flash('error', `Không thể tạo bảng size: ${error.message}`);
    return redirectBackOrDefault(req, res, `${adminBase(req)}/size-guides/create`);
  }
};

const chinhSua = async (req, res) => {
  try {
    const result = await sizeGuidesService.getChinhSuaData(req.params.id);
    if (!result.ok) return res.status(404).send('Không tìm thấy bảng size');
    return res.render('admin/pages/size-guides/edit.pug', result.data);
  } catch (error) {
    console.error('Edit size guide page error:', error);
    return res.status(500).send('Không thể tải trang chỉnh sửa bảng size');
  }
};

const chinhSuaPost = async (req, res) => {
  try {
    const result = await sizeGuidesService.capNhatGuide(req.params.id, req.body || {});
    return xuLyKetQuaSSR(req, res, result, `${adminBase(req)}/size-guides`);
  } catch (error) {
    console.error('Update size guide error:', error);
    req.flash('error', `Không thể cập nhật bảng size: ${error.message}`);
    return redirectBackOrDefault(req, res, `${adminBase(req)}/size-guides`);
  }
};

const xoa = async (req, res) => {
  try {
    const result = await sizeGuidesService.xoaGuide(req.params.id);
    return xuLyKetQuaSSR(req, res, result, `${adminBase(req)}/size-guides`);
  } catch (error) {
    console.error('Delete size guide error:', error);
    req.flash('error', `Không thể xóa bảng size: ${error.message}`);
    return redirectBackOrDefault(req, res, `${adminBase(req)}/size-guides`);
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chinhSua,
  chinhSuaPost,
  xoa
};
