const importsService = require('../../services/inventory/admin-imports.service.js');
const adminControllerService = require('../../services/communication/admin-controller.service');

function importsPath(req, subPath = '') {
  return importsService.layDuongDanImports({ adminPrefix: adminControllerService.layAdminBase(req), subPath });
}

function layDuongDanQuayLaiHopLe(req) {
  const candidate = String(req?.body?.returnTo || req?.query?.returnTo || '').trim();
  if (!candidate) return '';
  const baseImportsPath = importsPath(req);
  if (candidate.startsWith(`${baseImportsPath}?`) || candidate === baseImportsPath) return candidate;
  return '';
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
      return adminControllerService.xuLyKetQuaSSR(req, res, result, {
        successPath: importsPath(req),
        errorPath: importsPath(req, 'create'),
        resolveFlashType: importsService.xacDinhLoaiFlashKetQua
      });
    }

    return adminControllerService.xuLyKetQuaSSR(req, res, result, {
      successPath: importsPath(req),
      errorPath: importsPath(req, 'create'),
      resolveFlashType: importsService.xacDinhLoaiFlashKetQua
    });
  } catch (error) {
    console.error('Create import receipt error:', error);
    req.flash('error', `Không thể tạo phiếu nhập: ${error.message}`);
    return adminControllerService.redirectVe(req, res, importsPath(req, 'create'));
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
    if (!result.ok) {
      if (result.code === 'READ_ONLY_RETURN' || result.code === 'READ_ONLY_CONFIRMED') {
        req.flash('warning', result.message || 'Phiếu nhập hoàn trả không cho chỉnh sửa.');
        return adminControllerService.redirectVe(req, res, importsPath(req, `${result.receiptId || req.params.id}`));
      }
      return res.status(404).send(result.message);
    }

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
      return adminControllerService.xuLyKetQuaSSR(req, res, result, {
        successPath: importsPath(req, `${result.receiptId || req.params.id}`),
        errorPath: importsPath(req, `${result.receiptId || req.params.id}/edit`),
        resolveFlashType: importsService.xacDinhLoaiFlashKetQua
      });
    }

    return adminControllerService.xuLyKetQuaSSR(req, res, result, {
      successPath: importsPath(req, `${result.receiptId}`),
      errorPath: importsPath(req, `${req.params.id}/edit`),
      resolveFlashType: importsService.xacDinhLoaiFlashKetQua
    });
  } catch (error) {
    console.error('Import receipt edit save error:', error);
    req.flash('error', `Không thể lưu chỉnh sửa: ${error.message}`);
    return adminControllerService.redirectVe(req, res, importsPath(req, `${req.params.id}/edit`));
  }
};

const xoaPhieu = async (req, res) => {
  try {
    const result = await importsService.xoaPhieuNhap(req.params.id);
    return adminControllerService.xuLyKetQuaSSR(req, res, result, {
      successPath: importsPath(req),
      errorPath: result.receiptId ? importsPath(req, `${result.receiptId}`) : importsPath(req),
      resolveFlashType: importsService.xacDinhLoaiFlashKetQua
    });
  } catch (error) {
    console.error('Delete import receipt error:', error);
    req.flash('error', `Không thể xóa phiếu nhập: ${error.message}`);
    return adminControllerService.redirectVe(req, res, importsPath(req));
  }
};

const xuatKhoPhieuPost = async (req, res) => {
  const returnTo = layDuongDanQuayLaiHopLe(req);
  try {
    const result = await importsService.xuatKhoPhieuNhap({
      id: req.params.id,
      adminUser: req.adminUser,
      user: req.user
    });

    return adminControllerService.xuLyKetQuaSSR(req, res, result, {
      successPath: returnTo || importsPath(req),
      errorPath: returnTo || importsPath(req),
      resolveFlashType: importsService.xacDinhLoaiFlashKetQua
    });
  } catch (error) {
    console.error('Export import receipt error:', error);
    req.flash('error', `Không thể xuất kho phiếu nhập: ${error.message}`);
    return adminControllerService.redirectVe(req, res, returnTo || importsPath(req));
  }
};

const taoPhieuXuatTuPhieuNhapPost = async (req, res) => {
  try {
    const result = await importsService.taoPhieuXuatTuPhieuNhap({
      id: req.params.id,
      body: req.body || {},
      adminUser: req.adminUser,
      user: req.user
    });

    const adminBase = adminControllerService.layAdminBase(req);
    const successPath = result.exportId
      ? `${adminBase}/exports/${result.exportId}`
      : importsPath(req, `${result.receiptId || req.params.id}`);
    const errorPath = importsPath(req, `${result.receiptId || req.params.id}`);
    return adminControllerService.xuLyKetQuaSSR(req, res, result, {
      successPath,
      errorPath,
      resolveFlashType: importsService.xacDinhLoaiFlashKetQua
    });
  } catch (error) {
    console.error('Create export from import receipt error:', error);
    req.flash('error', `Khong the tao phieu xuat tu phieu nhap: ${error.message}`);
    return adminControllerService.redirectVe(req, res, importsPath(req, `${req.params.id}`));
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
  xuatKhoPhieuPost,
  taoPhieuXuatTuPhieuNhapPost
};
