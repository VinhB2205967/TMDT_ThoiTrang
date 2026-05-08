const {
  layDanhSachHoiThoaiAdmin,
  layChiTietHoiThoaiTheoUser,
  danhDauDaDocVaLayTong,
  layTongTinNhanChuaDocAdmin
} = require('../../../services/communication/admin-chat.service');
const { buildAdminAiSuggestion } = require('../../../services/communication/admin-ai-chat.service');
const { resolveChatMedia } = require('../../../middlewares/chatUpload');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.layDanhSachHoiThoai = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const conversations = await layDanhSachHoiThoaiAdmin({ query: q });
    return traJsonThanhCong(res, { data: { conversations } });
  } catch (error) {
    console.error('admin.chats.api.layDanhSachHoiThoai error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_CHAT_LIST_FAILED',
      message: 'Khong the lay danh sach hoi thoai'
    });
  }
};

module.exports.layLichSuTheoUser = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    if (!userId) {
      return traJsonThatBai(res, {
        status: 400,
        code: 'MISSING_USER_ID',
        message: 'Thieu userId'
      });
    }

    const data = await layChiTietHoiThoaiTheoUser({
      userId,
      limit: req.query.limit || 100
    });

    return traJsonThanhCong(res, { data });
  } catch (error) {
    console.error('admin.chats.api.layLichSuTheoUser error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_CHAT_MESSAGES_FAILED',
      message: 'Khong the lay lich su tin nhan'
    });
  }
};

module.exports.danhDauDaDocTheoUser = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    if (!userId) {
      return traJsonThatBai(res, {
        status: 400,
        code: 'MISSING_USER_ID',
        message: 'Thieu userId'
      });
    }

    const data = await danhDauDaDocVaLayTong({ userId });
    return traJsonThanhCong(res, { data });
  } catch (error) {
    console.error('admin.chats.api.danhDauDaDocTheoUser error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_CHAT_MARK_READ_FAILED',
      message: 'Khong the danh dau da doc'
    });
  }
};

module.exports.layTongChuaDoc = async (_req, res) => {
  try {
    const data = await layTongTinNhanChuaDocAdmin();
    return traJsonThanhCong(res, { data });
  } catch (error) {
    console.error('admin.chats.api.layTongChuaDoc error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_CHAT_UNREAD_TOTAL_FAILED',
      message: 'Khong the lay tong tin nhan chua doc'
    });
  }
};

module.exports.uploadMedia = async (req, res) => {
  try {
    const media = resolveChatMedia(req.file);
    if (!media) {
      return traJsonThatBai(res, {
        status: 400,
        code: 'MISSING_FILE',
        message: 'Thieu file upload'
      });
    }
    return traJsonThanhCong(res, { data: { media } });
  } catch (error) {
    console.error('admin.chats.api.uploadMedia error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_CHAT_UPLOAD_FAILED',
      message: 'Khong the upload tep'
    });
  }
};

module.exports.aiSuggest = async (req, res) => {
  try {
    const userId = String(req.body && req.body.userId ? req.body.userId : '').trim();
    if (!userId) {
      return traJsonThatBai(res, {
        status: 400,
        code: 'MISSING_USER_ID',
        message: 'Thieu userId'
      });
    }

    const action = String(req.body && req.body.action ? req.body.action : '').trim();
    const provider = String(req.body && req.body.provider ? req.body.provider : '').trim();
    const model = String(req.body && req.body.model ? req.body.model : '').trim();
    const historyLimit = req.body && req.body.historyLimit ? Number(req.body.historyLimit) : undefined;

    const result = await buildAdminAiSuggestion({
      userId,
      action,
      provider,
      model,
      historyLimit
    });

    return traJsonThanhCong(res, { data: result });
  } catch (error) {
    console.error('admin.chats.api.aiSuggest error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_CHAT_AI_FAILED',
      message: 'Khong the goi y cau tra loi'
    });
  }
};

