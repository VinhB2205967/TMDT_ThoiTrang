const {
  getAdminConversationSummaries,
  getConversationMessages,
  markAdminRead,
  getAdminUnreadTotal,
  getUserBasicInfo
} = require('../../services/communication/chat.service.js');
const { isUserOnline } = require('../../socketio/chat.socket');
const { resolveChatMedia } = require('../../middlewares/chatUpload');

module.exports.trangChat = async (req, res) => {
  return res.render('admin/pages/chat/index.pug', {
    titlePage: 'Chat khách hàng',
    adminUserId: req.adminUser && req.adminUser._id ? String(req.adminUser._id) : ''
  });
};

module.exports.layDanhSachHoiThoai = async (req, res) => {
  const q = String(req.query.q || '').trim();
  const conversations = await getAdminConversationSummaries({ query: q });
  return res.json({
    success: true,
    conversations: conversations.map((item) => ({
      ...item,
      online: isUserOnline(item.clientId)
    }))
  });
};

module.exports.layLichSuTheoUser = async (req, res) => {
  const userId = String(req.params.userId || '');
  if (!userId) {
    return res.status(400).json({ success: false, message: 'Thiếu userId' });
  }

  const user = await getUserBasicInfo(userId);
  const messages = await getConversationMessages({ clientId: userId, limit: req.query.limit || 100 });
  return res.json({
    success: true,
    user,
    online: isUserOnline(userId),
    messages
  });
};

module.exports.danhDauDaDocTheoUser = async (req, res) => {
  const userId = String(req.params.userId || '');
  if (!userId) {
    return res.status(400).json({ success: false, message: 'Thiếu userId' });
  }

  const updated = await markAdminRead({ clientId: userId });
  const total = await getAdminUnreadTotal();
  return res.json({ success: true, updated, totalUnread: total });
};

module.exports.layTongChuaDoc = async (req, res) => {
  const count = await getAdminUnreadTotal();
  return res.json({ success: true, count });
};

module.exports.uploadMedia = async (req, res) => {
  const media = resolveChatMedia(req.file);
  if (!media) {
    return res.status(400).json({ success: false, message: 'Thiếu file upload' });
  }
  return res.json({ success: true, media });
};
