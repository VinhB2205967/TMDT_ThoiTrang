const importsService = require('../../services/inventory/admin-imports.service.js');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

function adminBase(req) {
  return req.app.locals.admin || '/admin';
}

function importsPath(req, subPath = '') {
  return importsService.layDuongDanImports({ adminPrefix: adminBase(req), subPath });
}

function redirectVe(req, res, fallback) {
  return redirectBackOrDefault(req, res, fallback);
}

function xuLyKetQuaSSR(req, res, result, { successPath, errorPath }) {
  if (req.flash && result.message) req.flash(importsService.xacDinhLoaiFlashKetQua(result), result.message);
  const fallback = result.ok ? successPath : (errorPath || successPath);
  return redirectVe(req, res, fallback);
}

const danhSach = async (req, res) => {
  try {
    const viewData = await importsService.getDanhSachData(req.query || {});
    res.render('admin/pages/imports/index.pug', viewData);
  } catch (error) {
    console.error('Load import receipts error:', error);
    res.status(500).send('Không tải được danh sách phiếu nhập');
  }
};

const taoMoi = async (req, res) => {
  try {
    const viewData = await importsService.getTaoMoiData();
    res.render('admin/pages/imports/create.pug', viewData);
  } catch (error) {
    console.error('Create import receipt page error:', error);
    res.status(500).send('Không thể tải trang nhập kho');
  }
};

const taoMoiPost = async (req, res) => {
  try {
    const result = await importsService.taoMoiPhieuNhap({
      body: req.body || {},
      files: req.files || [],
      adminUser: req.adminUser,
      user: req.user
    });

    if (!result.ok) {
      return xuLyKetQuaSSR(req, res, result, { successPath: importsPath(req), errorPath: importsPath(req, 'create') });
    }

    return xuLyKetQuaSSR(req, res, result, { successPath: importsPath(req), errorPath: importsPath(req, 'create') });
  } catch (error) {
    console.error('Create import receipt error:', error);
    req.flash('error', `Không thể tạo phiếu nhập: ${error.message}`);
    return redirectVe(req, res, importsPath(req, 'create'));
  }
};

const chiTiet = async (req, res) => {
  try {
    const result = await importsService.getChiTietData(req.params.id);
    if (!result.ok) return res.status(404).send(result.message);

    return res.render('admin/pages/imports/show.pug', result.data);
  } catch (error) {
    console.error('Import receipt detail error:', error);
    return res.status(500).send('Không tải được chi tiết phiếu nhập');
  }
};

const chinhSua = async (req, res) => {
  try {
    const result = await importsService.getChinhSuaData(req.params.id);
    if (!result.ok) return res.status(404).send(result.message);

    return res.render('admin/pages/imports/edit.pug', result.data);
  } catch (error) {
    console.error('Import receipt edit page error:', error);
    return res.status(500).send('Không thể tải trang chỉnh sửa phiếu nhập');
  }
};

const chinhSuaPost = async (req, res) => {
  try {
    const result = await importsService.chinhSuaPhieuNhap({
      id: req.params.id,
      body: req.body || {},
      files: req.files || [],
      adminUser: req.adminUser,
      user: req.user
    });

    if (!result.ok) {
      return xuLyKetQuaSSR(req, res, result, {
        successPath: importsPath(req, `${result.receiptId || req.params.id}`),
        errorPath: importsPath(req, `${result.receiptId || req.params.id}/edit`)
      });
    }

    return xuLyKetQuaSSR(req, res, result, {
      successPath: importsPath(req, `${result.receiptId}`),
      errorPath: importsPath(req, `${req.params.id}/edit`)
    });
  } catch (error) {
    console.error('Import receipt edit save error:', error);
    req.flash('error', `Không thể lưu chỉnh sửa: ${error.message}`);
    return redirectVe(req, res, importsPath(req, `${req.params.id}/edit`));
  }
};

const xoaPhieu = async (req, res) => {
  try {
    const result = await importsService.xoaPhieuNhap(req.params.id);
    return xuLyKetQuaSSR(req, res, result, {
      successPath: importsPath(req),
      errorPath: result.receiptId ? importsPath(req, `${result.receiptId}`) : importsPath(req)
    });
  } catch (error) {
    console.error('Delete import receipt error:', error);
    req.flash('error', `Không thể xóa phiếu nhập: ${error.message}`);
    return redirectVe(req, res, importsPath(req));
  }
};

const xuatKhoPhieuPost = async (req, res) => {
  try {
    const result = await importsService.xuatKhoPhieuNhap({
      id: req.params.id,
      adminUser: req.adminUser,
      user: req.user
    });

    return xuLyKetQuaSSR(req, res, result, {
      successPath: importsPath(req, `${result.receiptId}`),
      errorPath: result.receiptId ? importsPath(req, `${result.receiptId}`) : importsPath(req)
    });
  } catch (error) {
    console.error('Export import receipt error:', error);
    req.flash('error', `Không thể xuất kho phiếu nhập: ${error.message}`);
    return redirectVe(req, res, importsPath(req));
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chiTiet,
  chinhSua,
  chinhSuaPost,
  xoaPhieu,
  xuatKhoPhieuPost
};
