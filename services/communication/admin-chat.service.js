const {
  getAdminConversationSummaries,
  getConversationMessages,
  markAdminRead,
  getAdminUnreadTotal,
  getUserBasicInfo
} = require('./chat.service.js');
const { isUserOnline } = require('../../socketio/chat.socket');

async function layDanhSachHoiThoaiAdmin({ query = '' } = {}) {
  const conversations = await getAdminConversationSummaries({ query });
  return conversations.map((item) => ({
    ...item,
    online: isUserOnline(item.clientId)
  }));
}

async function layChiTietHoiThoaiTheoUser({ userId, limit = 100 }) {
  const user = await getUserBasicInfo(userId);
  const messages = await getConversationMessages({ clientId: userId, limit });
  return {
    user,
    online: isUserOnline(userId),
    messages
  };
}

async function danhDauDaDocVaLayTong({ userId }) {
  const updated = await markAdminRead({ clientId: userId });
  const totalUnread = await getAdminUnreadTotal();
  return { updated, totalUnread };
}

async function layTongTinNhanChuaDocAdmin() {
  const count = await getAdminUnreadTotal();
  return { count };
}

module.exports = {
  layDanhSachHoiThoaiAdmin,
  layChiTietHoiThoaiTheoUser,
  danhDauDaDocVaLayTong,
  layTongTinNhanChuaDocAdmin
};
