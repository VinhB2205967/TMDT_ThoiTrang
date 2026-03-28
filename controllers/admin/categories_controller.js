const categoriesService = require('../../services/catalog/admin-categories.service.js');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');
const {
  laYeuCauApi,
  traJsonThanhCong,
  traJsonThatBai
} = require('../../services/communication/hybrid-response.service');

function xuLyKetQuaSSR(req, res, result) {
  if (req.flash && result.message) req.flash(result.ok ? 'success' : 'error', result.message);
  return redirectBackOrDefault(req, res, '/admin/categories');
}

function xuLyKetQua(req, res, result) {
  if (laYeuCauApi(req)) {
    if (result?.ok) {
      return traJsonThanhCong(res, {
        status: result.status || 200,
        message: result.message,
        data: result.data || null
      });
    }

    return traJsonThatBai(res, {
      status: result?.status || 400,
      message: result?.message || 'Yeu cau that bai'
    });
  }

  return xuLyKetQuaSSR(req, res, result);
}

module.exports.danhSach = async (req, res) => {
  const viewData = await categoriesService.layDanhSach(req.query || {});
  res.render('admin/pages/categories/index.pug', viewData);
};

module.exports.layCayJson = async (req, res) => {
  try {
    const result = await categoriesService.layCayJson(req.query || {});
    return xuLyKetQua(req, res, result);
  } catch (error) {
    return xuLyKetQua(req, res, {
      ok: false,
      status: 500,
      message: `Khong the tai cay danh muc: ${error.message}`
    });
  }
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await categoriesService.taoDM(req.body || {});
    return xuLyKetQua(req, res, result);
  } catch (error) {
    return xuLyKetQua(req, res, {
      ok: false,
      status: 500,
      message: `Khong the tao danh muc: ${error.message}`
    });
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await categoriesService.capNhatDM(req.params.id, req.body || {});
    return xuLyKetQua(req, res, result);
  } catch (error) {
    return xuLyKetQua(req, res, {
      ok: false,
      status: 500,
      message: `Khong the cap nhat danh muc: ${error.message}`
    });
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await categoriesService.xoaDM(req.params.id);
    return xuLyKetQua(req, res, result);
  } catch (error) {
    return xuLyKetQua(req, res, {
      ok: false,
      status: 500,
      message: `Khong the xoa danh muc: ${error.message}`
    });
  }
};

module.exports.doiTrangThai = async (req, res) => {
  try {
    const result = await categoriesService.doiTrangThaiDM(req.params.id);
    return xuLyKetQua(req, res, result);
  } catch (error) {
    return xuLyKetQua(req, res, {
      ok: false,
      status: 500,
      message: `Khong the cap nhat trang thai: ${error.message}`
    });
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const result = await categoriesService.sapXepDM(items);
    return xuLyKetQua(req, res, result);
  } catch (error) {
    return xuLyKetQua(req, res, {
      ok: false,
      status: 500,
      message: `Khong the sap xep danh muc: ${error.message}`
    });
  }
};
