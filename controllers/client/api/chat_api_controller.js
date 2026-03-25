const {
  getConversationMessages,
  getClientUnreadCount,
  markClientRead
} = require('../../../services/communication/chat.service.js');
const { getAdminOnlineStatus } = require('../../../socketio/chat.socket');
const { resolveChatMedia } = require('../../../middlewares/chatUpload');
// lấy lịch sử chat của khách hàng, sắp xếp theo thời gian giảm dần, có phân trang
module.exports.layLichSu = async (req, res) => {
  const userId = req.user && req.user._id ? String(req.user._id) : '';
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
  }

  const messages = await getConversationMessages({
    clientId: userId,
    limit: req.query.limit || 50
  });

  return res.json({
    success: true,
    messages,
    adminOnline: getAdminOnlineStatus()
  });
};
// Đếm số tin nhắn chưa đọc của khách hàng
module.exports.laySoChuaDoc = async (req, res) => {
  const userId = req.user && req.user._id ? String(req.user._id) : '';
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
  }

  const count = await getClientUnreadCount({ clientId: userId });
  return res.json({ success: true, count });
};
// Đánh dấu tất cả tin nhắn của khách hàng là đã đọc
module.exports.danhDauDaDoc = async (req, res) => {
  const userId = req.user && req.user._id ? String(req.user._id) : '';
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
  }

  const updated = await markClientRead({ clientId: userId });
  return res.json({ success: true, updated });
};

module.exports.uploadMedia = async (req, res) => {
  const media = resolveChatMedia(req.file);
  if (!media) {
    return res.status(400).json({ success: false, message: 'Thiếu file upload' });
  }
  return res.json({ success: true, media });
};
