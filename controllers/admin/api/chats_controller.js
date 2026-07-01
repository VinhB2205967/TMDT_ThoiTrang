const {
  layDanhSachHoiThoaiAdmin,
  layChiTietHoiThoaiTheoUser,
  danhDauDaDocVaLayTong,
  layTongTinNhanChuaDocAdmin
} = require('../../../services/communication/admin-chat.service');
const { buildAdminAiSuggestion } = require('../../../services/communication/admin-ai-chat.service');
const {
  getAutoReplyConfig,
  updateAutoReplyConfig,
  getAutoReplyStats
} = require('../../../services/communication/admin-auto-reply.service');
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
      message: 'Không thể đánh dấu đã đọc'
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
      message: 'Không thể lấy tổng tin nhắn chưa đọc'
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

// Auto-reply endpoints

module.exports.getAutoReplySettings = async (req, res) => {
  try {
    const config = await getAutoReplyConfig();
    const stats = await getAutoReplyStats();

    return traJsonThanhCong(res, {
      data: {
        config,
        stats
      }
    });
  } catch (error) {
    console.error('admin.chats.api.getAutoReplySettings error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_AUTO_REPLY_GET_FAILED',
      message: 'Khong the lay cau hinh tu tra loi'
    });
  }
};

module.exports.updateAutoReplySettings = async (req, res) => {
  try {
    const updates = req.body || {};

    // Validate updates
    const validFields = ['enabled', 'provider', 'model', 'autoResponseDelay', 'minMessageLength', 'maxAutoRepliesPerDay', 'excludeKeywords'];
    const newConfig = {};

    validFields.forEach(field => {
      if (field in updates) {
        newConfig[field] = updates[field];
      }
    });

    if (Object.keys(newConfig).length === 0) {
      return traJsonThatBai(res, {
        status: 400,
        code: 'INVALID_AUTO_REPLY_CONFIG',
        message: 'Khong co truong nao de cap nhat'
      });
    }

    // Validate types
    if ('enabled' in newConfig && typeof newConfig.enabled !== 'boolean') {
      return traJsonThatBai(res, {
        status: 400,
        code: 'INVALID_AUTO_REPLY_CONFIG',
        message: 'enabled phai la boolean'
      });
    }

    if ('provider' in newConfig && typeof newConfig.provider !== 'string') {
      return traJsonThatBai(res, {
        status: 400,
        code: 'INVALID_AUTO_REPLY_CONFIG',
        message: 'provider phai la string'
      });
    }

    if ('autoResponseDelay' in newConfig) {
      const delay = Number(newConfig.autoResponseDelay);
      if (isNaN(delay) || delay < 0 || delay > 30000) {
        return traJsonThatBai(res, {
          status: 400,
          code: 'INVALID_AUTO_REPLY_CONFIG',
          message: 'autoResponseDelay phai tu 0-30000ms'
        });
      }
      newConfig.autoResponseDelay = delay;
    }

    if ('minMessageLength' in newConfig) {
      const len = Number(newConfig.minMessageLength);
      if (isNaN(len) || len < 1 || len > 1000) {
        return traJsonThatBai(res, {
          status: 400,
          code: 'INVALID_AUTO_REPLY_CONFIG',
          message: 'minMessageLength phai tu 1-1000'
        });
      }
      newConfig.minMessageLength = len;
    }

    if ('maxAutoRepliesPerDay' in newConfig) {
      const max = Number(newConfig.maxAutoRepliesPerDay);
      if (isNaN(max) || max < 1 || max > 1000) {
        return traJsonThatBai(res, {
          status: 400,
          code: 'INVALID_AUTO_REPLY_CONFIG',
          message: 'maxAutoRepliesPerDay phai tu 1-1000'
        });
      }
      newConfig.maxAutoRepliesPerDay = max;
    }

    if ('excludeKeywords' in newConfig) {
      if (!Array.isArray(newConfig.excludeKeywords)) {
        return traJsonThatBai(res, {
          status: 400,
          code: 'INVALID_AUTO_REPLY_CONFIG',
          message: 'excludeKeywords phai la mang'
        });
      }
    }

    const updated = await updateAutoReplyConfig(newConfig);
    const stats = await getAutoReplyStats();

    return traJsonThanhCong(res, {
      data: {
        config: updated,
        stats
      }
    });
  } catch (error) {
    console.error('admin.chats.api.updateAutoReplySettings error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_AUTO_REPLY_UPDATE_FAILED',
      message: 'Khong the cap nhat cau hinh tu tra loi'
    });
  }
};

module.exports.getAutoReplyStats = async (req, res) => {
  try {
    const stats = await getAutoReplyStats();
    return traJsonThanhCong(res, { data: stats });
  } catch (error) {
    console.error('admin.chats.api.getAutoReplyStats error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'ADMIN_AUTO_REPLY_STATS_FAILED',
      message: 'Khong the lay thong ke tu tra loi'
    });
  }
};

