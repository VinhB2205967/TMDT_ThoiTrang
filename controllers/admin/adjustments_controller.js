const adjustmentsService = require('../../services/inventory/admin-adjustments.service');
const adminControllerService = require('../../services/communication/admin-controller.service');

function adjustmentsPath(req, subPath = '') {
  return adjustmentsService.layDuongDanAdjustments({
    adminPrefix: adminControllerService.layAdminBase(req),
    subPath
  });
}

const danhSach = async (req, res) => {
  try {
    const data = await adjustmentsService.getDanhSachData();
    return res.render('admin/pages/adjustments/index.pug', data);
  } catch (error) {
    console.error('Load adjustments error:', error);
    return res.status(500).send('Không tải được phiếu điều chỉnh kho');
  }
};

const taoMoi = async (req, res) => {
  try {
    const data = await adjustmentsService.getTaoMoiData();
    return res.render('admin/pages/adjustments/create.pug', data);
  } catch (error) {
    console.error('Load create adjustment page error:', error);
    return res.status(500).send('Không thể tải trang tạo phiếu điều chỉnh');
  }
};

const taoMoiPost = async (req, res) => {
  try {
    const result = await adjustmentsService.taoMoiPhieuDieuChinh({
      body: req.body || {},
      adminUser: req.adminUser,
      user: req.user
    });

    if (!result.ok) {
      return adminControllerService.xuLyKetQuaSSR(req, res, result, {
        successPath: adjustmentsPath(req),
        errorPath: adjustmentsPath(req, 'create'),
        resolveFlashType: adjustmentsService.xacDinhLoaiFlashKetQua
      });
    }

    return adminControllerService.xuLyKetQuaSSR(req, res, result, {
      successPath: adjustmentsPath(req, `${result.receiptId}`),
      errorPath: adjustmentsPath(req, 'create'),
      resolveFlashType: adjustmentsService.xacDinhLoaiFlashKetQua
    });
  } catch (error) {
    console.error('Create adjustment error:', error);
    req.flash('error', `Không thể tạo phiếu điều chỉnh: ${error.message}`);
    return adminControllerService.redirectVe(req, res, adjustmentsPath(req, 'create'));
  }
};

const chiTiet = async (req, res) => {
  try {
    const result = await adjustmentsService.getChiTietData(req.params.id);
    if (!result.ok) return res.status(404).send(result.message);
    return res.render('admin/pages/adjustments/show.pug', result.data);
  } catch (error) {
    console.error('Adjustment detail error:', error);
    return res.status(500).send('Không tải được chi tiết phiếu điều chỉnh');
  }
};

const xacNhanPost = async (req, res) => {
  try {
    const result = await adjustmentsService.xacNhanPhieuDieuChinh({
      idOrCode: req.params.id,
      adminUser: req.adminUser,
      user: req.user
    });

    return adminControllerService.xuLyKetQuaSSR(req, res, result, {
      successPath: adjustmentsPath(req, `${result.receiptId || req.params.id}`),
      errorPath: adjustmentsPath(req, `${result.receiptId || req.params.id}`),
      resolveFlashType: adjustmentsService.xacDinhLoaiFlashKetQua
    });
  } catch (error) {
    console.error('Confirm adjustment error:', error);
    req.flash('error', `Không thể xác nhận phiếu điều chỉnh: ${error.message}`);
    return adminControllerService.redirectVe(req, res, adjustmentsPath(req, `${req.params.id}`));
  }
};

const xoaPost = async (req, res) => {
  try {
    const result = await adjustmentsService.xoaPhieuDieuChinh(req.params.id);
    return adminControllerService.xuLyKetQuaSSR(req, res, result, {
      successPath: adjustmentsPath(req),
      errorPath: result.receiptId ? adjustmentsPath(req, `${result.receiptId}`) : adjustmentsPath(req),
      resolveFlashType: adjustmentsService.xacDinhLoaiFlashKetQua
    });
  } catch (error) {
    console.error('Delete adjustment error:', error);
    req.flash('error', `Không thể xóa phiếu điều chỉnh: ${error.message}`);
    return adminControllerService.redirectVe(req, res, adjustmentsPath(req));
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chiTiet,
  xacNhanPost,
  xoaPost
};
