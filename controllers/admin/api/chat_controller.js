const {
  layDanhSachHoiThoaiAdmin,
  layChiTietHoiThoaiTheoUser,
  danhDauDaDocVaLayTong,
  layTongTinNhanChuaDocAdmin
} = require('../../../services/communication/admin-chat.service');
const { resolveChatMedia } = require('../../../middlewares/chatUpload');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.layDanhSachHoiThoai = async (req, res) => {
  const q = String(req.query.q || '').trim();
  const conversations = await layDanhSachHoiThoaiAdmin({ query: q });
  return traJsonThanhCong(res, { data: { conversations } });
};

module.exports.layLichSuTheoUser = async (req, res) => {
  const userId = String(req.params.userId || '');
  if (!userId) return traJsonThatBai(res, { status: 400, code: 'MISSING_USER_ID', message: 'Thieu userId' });

  const data = await layChiTietHoiThoaiTheoUser({ userId, limit: req.query.limit || 100 });
  return traJsonThanhCong(res, { data });
};

module.exports.danhDauDaDocTheoUser = async (req, res) => {
  const userId = String(req.params.userId || '');
  if (!userId) return traJsonThatBai(res, { status: 400, code: 'MISSING_USER_ID', message: 'Thieu userId' });

  const data = await danhDauDaDocVaLayTong({ userId });
  return traJsonThanhCong(res, { data });
};

module.exports.layTongChuaDoc = async (req, res) => {
  const data = await layTongTinNhanChuaDocAdmin();
  return traJsonThanhCong(res, { data });
};

module.exports.uploadMedia = async (req, res) => {
  const media = resolveChatMedia(req.file);
  if (!media) return traJsonThatBai(res, { status: 400, code: 'MISSING_FILE', message: 'Thieu file upload' });
  return traJsonThanhCong(res, { data: { media } });
};
