const Nguoidung = require('../models/user_model');
const { layTKTheoId } = require('../services/account/index.js');
const {
  PHONG_ADMIN,
  taoTin,
  clientDaDoc,
  adminDaDoc,
  demChuaDocClient,
  demChuaDocAdmin,
  layUserCoBan
} = require('../services/communication/chat.service.js');

const onlineByUser = new Map();
const onlineAdmins = new Set();

function roomUser(userId) {
  return `user_${userId}`;
}

function increaseOnline(userId, socketId) {
  const key = String(userId);
  const set = onlineByUser.get(key) || new Set();
  set.add(socketId);
  onlineByUser.set(key, set);
}

function decreaseOnline(userId, socketId) {
  const key = String(userId);
  const set = onlineByUser.get(key);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    onlineByUser.delete(key);
    return false;
  }
  onlineByUser.set(key, set);
  return true;
}

function isUserOnline(userId) {
  const set = onlineByUser.get(String(userId));
  return Boolean(set && set.size > 0);
}

function getAdminOnlineStatus() {
  return onlineAdmins.size > 0;
}

async function buildSocketUser(auth) {
  const userId = auth && auth.userId ? String(auth.userId) : '';
  const role = auth && auth.role ? String(auth.role) : '';
  if (!userId || !['admin', 'client'].includes(role)) return null;

  const user = await Nguoidung.findOne({ _id: userId, daxoa: { $ne: true } })
    .select('_id hoten email')
    .lean();
  if (!user) return null;

  if (role === 'admin') {
    const account = await layTKTheoId({ userId: user._id }).catch(() => null);
    if (!account || account.vaitro !== 'admin' || account.trangthai !== 'active') {
      return null;
    }
  }

  return {
    userId: String(user._id),
    role,
    name: user.hoten || user.email || 'Người dùng'
  };
}
// buil socket
function setupChatSocket(io) {
  io.on('connection', async (socket) => {
    const auth = socket.handshake && socket.handshake.auth ? socket.handshake.auth : {};
    const context = await buildSocketUser(auth);
    if (!context) {
      socket.emit('chat_error', { message: 'Xác thực socket thất bại' });
      socket.disconnect(true);
      return;
    }

    socket.data.user = context;
    socket.join(roomUser(context.userId));
    increaseOnline(context.userId, socket.id);

    if (context.role === 'admin') {
      onlineAdmins.add(context.userId);
      socket.join(PHONG_ADMIN);
      io.emit('presence_update', {
        userId: context.userId,
        role: 'admin',
        online: true
      });
    } else {
      io.to(PHONG_ADMIN).emit('presence_update', {
        userId: context.userId,
        role: 'client',
        online: true
      });
      socket.emit('presence_update', {
        role: 'admin',
        online: getAdminOnlineStatus()
      });
    }

    socket.on('join_user_room', async (payload = {}) => {
      const me = socket.data.user;
      if (!me || me.role !== 'admin') return;
      const userId = payload && payload.userId ? String(payload.userId) : '';
      if (!userId) return;
      socket.join(roomUser(userId));
      const userInfo = await layUserCoBan(userId);
      socket.emit('joined_user_room', {
        userId,
        user: userInfo,
        online: isUserOnline(userId)
      });
    });

    socket.on('send_message', async (payload = {}) => {
      const me = socket.data.user;
      if (!me) return;

      const content = String(payload.content || '').trim();
      const media = payload && payload.media ? payload.media : null;
      const mediaUrl = media && media.url ? String(media.url).trim() : '';
      if (!content && !mediaUrl) return;

      let clientId = '';
      let receiverId = null;
      let receiverRole = 'admin';

      if (me.role === 'client') {
        clientId = me.userId;
        receiverRole = 'admin';
      } else {
        clientId = payload && payload.userId ? String(payload.userId) : '';
        if (clientId) {
          const targetAccount = await layTKTheoId({ userId: clientId }).catch(() => null);
          if (targetAccount && targetAccount.vaitro === 'admin') {
            socket.emit('chat_error', { message: 'Không thể chat với tài khoản admin' });
            return;
          }
        }
        receiverId = clientId || null;
        receiverRole = 'client';
      }

      if (!clientId) {
        socket.emit('chat_error', { message: 'Thiếu người nhận' });
        return;
      }

      const saved = await taoTin({
        clientId,
        senderId: me.userId,
        senderRole: me.role,
        receiverId,
        receiverRole,
        content,
        media
      });

      io.to(roomUser(clientId)).to(PHONG_ADMIN).emit('receive_message', saved);

      if (me.role === 'client') {
        const adminUnreadTotal = await demChuaDocAdmin();
        io.to(PHONG_ADMIN).emit('unread_total', { count: adminUnreadTotal });
      } else {
        const userUnread = await demChuaDocClient({ clientId });
        io.to(roomUser(clientId)).emit('unread_count', { count: userUnread });
      }
    });

    socket.on('mark_read', async (payload = {}) => {
      const me = socket.data.user;
      if (!me) return;

      if (me.role === 'client') {
        await clientDaDoc({ clientId: me.userId });
        io.to(roomUser(me.userId)).emit('unread_count', { count: 0 });
        return;
      }

      const userId = payload && payload.userId ? String(payload.userId) : '';
      if (!userId) return;
      await adminDaDoc({ clientId: userId });
      const total = await demChuaDocAdmin();
      io.to(PHONG_ADMIN).emit('unread_total', { count: total });
      io.to(roomUser(userId)).emit('messages_read_by_admin', { userId });
    });

    socket.on('disconnect', () => {
      const me = socket.data.user;
      if (!me) return;

      const stillOnline = decreaseOnline(me.userId, socket.id);
      if (stillOnline) return;

      if (me.role === 'admin') {
        onlineAdmins.delete(me.userId);
        io.emit('presence_update', {
          userId: me.userId,
          role: 'admin',
          online: false
        });
        io.to(PHONG_ADMIN).emit('presence_update', {
          role: 'admin',
          online: getAdminOnlineStatus()
        });
      } else {
        io.to(PHONG_ADMIN).emit('presence_update', {
          userId: me.userId,
          role: 'client',
          online: false
        });
      }
    });
  });
}

module.exports = {
  setupChatSocket,
  roomUser,
  PHONG_ADMIN,
  isUserOnline,
  getAdminOnlineStatus
};

