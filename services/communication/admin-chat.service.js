const {
  layTomTatHoiThoaiAdmin,
  layTinHoiThoai,
  adminDaDoc,
  demChuaDocAdmin,
  layUserCoBan
} = require('./chat.service.js');
const { isUserOnline } = require('../../socketio/chat.socket');

async function layDanhSachHoiThoaiAdmin({ query = '' } = {}) {
  const conversations = await layTomTatHoiThoaiAdmin({ query });
  return conversations.map((item) => ({
    ...item,
    online: isUserOnline(item.clientId)
  }));
}

async function layChiTietHoiThoaiTheoUser({ userId, limit = 100 }) {
  const user = await layUserCoBan(userId);
  const messages = await layTinHoiThoai({ clientId: userId, limit });
  return {
    user,
    online: isUserOnline(userId),
    messages
  };
}
// Đánh dấu đã đọc và lấy tổng số tin nhắn chưa đọc sau khi cập nhật
async function danhDauDaDocVaLayTong({ userId }) {
  const updated = await adminDaDoc({ clientId: userId });
  const totalUnread = await demChuaDocAdmin();
  return { updated, totalUnread };
}
// Lấy tổng số tin nhắn chưa đọc cho admin
async function layTongTinNhanChuaDocAdmin() {
  const count = await demChuaDocAdmin();
  return { count };
}

module.exports = {
  layDanhSachHoiThoaiAdmin,
  layChiTietHoiThoaiTheoUser,
  danhDauDaDocVaLayTong,
  layTongTinNhanChuaDocAdmin
};

