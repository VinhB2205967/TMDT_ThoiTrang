const categoriesService = require('../../../services/catalog/admin-categories.service.js');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

function traKetQua(res, result, fallbackCode) {
  if (!result.ok) {
    return traJsonThatBai(res, {
      status: result.status || 400,
      code: result.code || fallbackCode,
      message: result.message
    });
  }

  return traJsonThanhCong(res, {
    status: result.status || 200,
    message: result.message,
    data: result.data || null
  });
}

module.exports.danhSach = async (req, res) => {
  try {
    const viewData = await categoriesService.getDanhSachData(req.query || {});
    return traJsonThanhCong(res, { data: viewData });
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'CATEGORIES_LIST_FAILED', message: error.message });
  }
};

module.exports.treeJson = async (req, res) => {
  try {
    const result = await categoriesService.getTreeJsonData(req.query || {});
    return traKetQua(res, result, 'CATEGORIES_TREE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'CATEGORIES_TREE_FAILED', message: error.message });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await categoriesService.taoDanhMuc(req.body || {});
    return traKetQua(res, result, 'CATEGORY_CREATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'CATEGORY_CREATE_FAILED', message: error.message });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await categoriesService.capNhatDanhMuc(req.params.id, req.body || {});
    return traKetQua(res, result, 'CATEGORY_UPDATE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'CATEGORY_UPDATE_FAILED', message: error.message });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await categoriesService.xoaDanhMuc(req.params.id);
    return traKetQua(res, result, 'CATEGORY_DELETE_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'CATEGORY_DELETE_FAILED', message: error.message });
  }
};

module.exports.doiTrangThai = async (req, res) => {
  try {
    const result = await categoriesService.doiTrangThaiDanhMuc(req.params.id);
    return traKetQua(res, result, 'CATEGORY_STATUS_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'CATEGORY_STATUS_FAILED', message: error.message });
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const result = await categoriesService.sapXepDanhMuc(items);
    return traKetQua(res, result, 'CATEGORY_SORT_FAILED');
  } catch (error) {
    return traJsonThatBai(res, { status: 500, code: 'CATEGORY_SORT_FAILED', message: error.message });
  }
};
