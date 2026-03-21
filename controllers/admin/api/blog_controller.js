const blogService = require('../../../services/content/admin-blog.service');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.danhSach = async (req, res) => {
  try {
    const result = await blogService.layDanhSachBaiViet();
    return traJsonThanhCong(res, { status: 200, data: result.data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BLOG_LIST_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await blogService.taoBaiViet({ body: req.body || {}, file: req.file });
    if (!result.ok) return traJsonThatBai(res, { status: result.status, code: result.code, message: result.message });
    return traJsonThanhCong(res, { status: result.status || 201, message: result.message, data: result.data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BLOG_CREATE_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await blogService.capNhatBaiViet({ id: req.params.id, body: req.body || {}, file: req.file });
    if (!result.ok) return traJsonThatBai(res, { status: result.status, code: result.code, message: result.message });
    return traJsonThanhCong(res, { status: result.status || 200, message: result.message, data: result.data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BLOG_UPDATE_FAILED', message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await blogService.xoaBaiViet({ id: req.params.id });
    if (!result.ok) return traJsonThatBai(res, { status: result.status, code: result.code, message: result.message });
    return traJsonThanhCong(res, { status: result.status || 200, message: result.message, data: null });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BLOG_DELETE_FAILED', message: error.message });
  }
};

module.exports.capNhatXuatBan = async (req, res) => {
  try {
    const result = await blogService.capNhatXuatBan({ id: req.params.id, body: req.body || {} });
    if (!result.ok) return traJsonThatBai(res, { status: result.status, code: result.code, message: result.message });
    return traJsonThanhCong(res, { status: result.status || 200, message: result.message, data: result.data });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'BLOG_PUBLISH_UPDATE_FAILED', message: error.message });
  }
};
