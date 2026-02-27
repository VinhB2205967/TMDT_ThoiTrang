const mongoose = require('mongoose');
const ChatMessage = require('../models/chat_message_model');
const Nguoidung = require('../models/user_model');

const ADMIN_ROOM = 'admin_room';

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function formatMessage(doc) {
  return {
    _id: String(doc._id),
    clientId: String(doc.clientId),
    senderId: String(doc.senderId),
    senderRole: doc.senderRole,
    receiverId: doc.receiverId ? String(doc.receiverId) : null,
    receiverRole: doc.receiverRole,
    content: doc.content,
    mediaUrl: doc.mediaUrl || '',
    mediaType: doc.mediaType || '',
    mediaMime: doc.mediaMime || '',
    mediaName: doc.mediaName || '',
    mediaSize: Number(doc.mediaSize || 0),
    isRead: Boolean(doc.isRead),
    readAt: doc.readAt || null,
    sentAt: doc.sentAt || null
  };
}

async function createMessage({
  clientId,
  senderId,
  senderRole,
  receiverId = null,
  receiverRole,
  content,
  media = null
}) {
  const clientObjectId = toObjectId(clientId);
  const senderObjectId = toObjectId(senderId);
  const receiverObjectId = receiverId ? toObjectId(receiverId) : null;
  const text = String(content || '').trim();
  const mediaUrl = media && media.url ? String(media.url).trim() : '';
  const mediaType = media && media.type ? String(media.type).trim() : '';

  if (!clientObjectId || !senderObjectId || (!text && !mediaUrl)) {
    throw new Error('Dữ liệu tin nhắn không hợp lệ');
  }

  const created = await ChatMessage.create({
    clientId: clientObjectId,
    senderId: senderObjectId,
    senderRole,
    receiverId: receiverObjectId,
    receiverRole,
    content: text,
    mediaUrl,
    mediaType: ['image', 'video'].includes(mediaType) ? mediaType : '',
    mediaMime: media && media.mime ? String(media.mime) : '',
    mediaName: media && media.name ? String(media.name) : '',
    mediaSize: media && media.size ? Number(media.size) : 0,
    sentAt: new Date()
  });

  return formatMessage(created);
}

async function getConversationMessages({ clientId, limit = 50 }) {
  const clientObjectId = toObjectId(clientId);
  if (!clientObjectId) return [];

  const cappedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const rows = await ChatMessage.find({
    clientId: clientObjectId,
    daxoa: { $ne: true }
  })
    .sort({ sentAt: -1, _id: -1 })
    .limit(cappedLimit)
    .lean();

  return rows.reverse().map(formatMessage);
}

async function markClientRead({ clientId }) {
  const clientObjectId = toObjectId(clientId);
  if (!clientObjectId) return 0;

  const result = await ChatMessage.updateMany(
    {
      clientId: clientObjectId,
      senderRole: 'admin',
      isRead: false,
      daxoa: { $ne: true }
    },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );
  return Number(result.modifiedCount || 0);
}

async function markAdminRead({ clientId }) {
  const clientObjectId = toObjectId(clientId);
  if (!clientObjectId) return 0;

  const result = await ChatMessage.updateMany(
    {
      clientId: clientObjectId,
      senderRole: 'client',
      isRead: false,
      daxoa: { $ne: true }
    },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );
  return Number(result.modifiedCount || 0);
}

async function getClientUnreadCount({ clientId }) {
  const clientObjectId = toObjectId(clientId);
  if (!clientObjectId) return 0;

  return ChatMessage.countDocuments({
    clientId: clientObjectId,
    senderRole: 'admin',
    isRead: false,
    daxoa: { $ne: true }
  });
}

async function getAdminUnreadTotal() {
  return ChatMessage.countDocuments({
    senderRole: 'client',
    isRead: false,
    daxoa: { $ne: true }
  });
}

async function getAdminConversationSummaries() {
  const rows = await ChatMessage.aggregate([
    { $match: { daxoa: { $ne: true } } },
    { $sort: { sentAt: -1, _id: -1 } },
    {
      $group: {
        _id: '$clientId',
        lastMessage: { $first: '$content' },
        lastMediaType: { $first: '$mediaType' },
        lastAt: { $first: '$sentAt' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$senderRole', 'client'] },
                  { $eq: ['$isRead', false] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $project: {
        _id: 0,
        clientId: '$_id',
        lastMessage: 1,
        lastMediaType: 1,
        lastAt: 1,
        unreadCount: 1,
        user: { $arrayElemAt: ['$user', 0] }
      }
    },
    { $sort: { lastAt: -1 } }
  ]);

  return rows.map((item) => {
    const summaryMessage = item.lastMessage || '';
    const mediaFallback = item.lastMediaType === 'video' ? '[Video]' : item.lastMediaType === 'image' ? '[Hình ảnh]' : '';
    return {
      clientId: String(item.clientId),
      userName: item.user && item.user.hoten ? item.user.hoten : 'Khách hàng',
      userEmail: item.user && item.user.email ? item.user.email : '',
      avatar: item.user && item.user.avatar ? item.user.avatar : '/images/avatar/avatar.png',
      lastMessage: summaryMessage || mediaFallback,
      lastAt: item.lastAt || null,
      unreadCount: Number(item.unreadCount || 0)
    };
  });
}

async function getUserBasicInfo(userId) {
  const objectId = toObjectId(userId);
  if (!objectId) return null;
  const user = await Nguoidung.findOne({ _id: objectId, daxoa: { $ne: true } })
    .select('_id hoten email avatar')
    .lean();
  if (!user) return null;
  return {
    userId: String(user._id),
    userName: user.hoten || 'Khách hàng',
    userEmail: user.email || '',
    avatar: user.avatar || '/images/avatar/avatar.png'
  };
}

module.exports = {
  ADMIN_ROOM,
  createMessage,
  getConversationMessages,
  markClientRead,
  markAdminRead,
  getClientUnreadCount,
  getAdminUnreadTotal,
  getAdminConversationSummaries,
  getUserBasicInfo
};
