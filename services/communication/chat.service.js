const mongoose = require('mongoose');
const ChatMessage = require('../../models/chat_message_model');
const Nguoidung = require('../../models/user_model');

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
    throw new Error('Dá»¯ liá»‡u tin nháº¯n khÃ´ng há»£p lá»‡');
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

function normalizeSearchText(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function getAdminConversationSummaries({ query = '' } = {}) {
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

  const summaryByClientId = new Map(rows.map((item) => [String(item.clientId || item._id || ''), item]));
  const allUsers = await Nguoidung.find({ daxoa: { $ne: true } })
    .select('_id hoten email sodienthoai avatar')
    .lean();

  const merged = [];

  for (const user of (allUsers || [])) {
    const clientId = String(user._id);
    const item = summaryByClientId.get(clientId) || {};
    const summaryMessage = item.lastMessage || '';
    const mediaFallback = item.lastMediaType === 'video' ? '[Video]' : item.lastMediaType === 'image' ? '[HÃ¬nh áº£nh]' : '';
    merged.push({
      clientId,
      userName: user.hoten || 'KhÃ¡ch hÃ ng',
      userEmail: user.email || '',
      userPhone: user.sodienthoai || '',
      avatar: user.avatar || '/images/avatar/avatar.png',
      lastMessage: summaryMessage || mediaFallback,
      lastAt: item.lastAt || null,
      unreadCount: Number(item.unreadCount || 0)
    });
  }

  // Keep orphan conversations (if user document was deleted) so admin can still review history.
  for (const item of (rows || [])) {
    const clientId = String(item.clientId || item._id || '');
    if (!clientId || merged.some((x) => x.clientId === clientId)) continue;
    const summaryMessage = item.lastMessage || '';
    const mediaFallback = item.lastMediaType === 'video' ? '[Video]' : item.lastMediaType === 'image' ? '[HÃ¬nh áº£nh]' : '';
    merged.push({
      clientId,
      userName: item.user && item.user.hoten ? item.user.hoten : 'KhÃ¡ch hÃ ng',
      userEmail: item.user && item.user.email ? item.user.email : '',
      userPhone: item.user && item.user.sodienthoai ? item.user.sodienthoai : '',
      avatar: item.user && item.user.avatar ? item.user.avatar : '/images/avatar/avatar.png',
      lastMessage: summaryMessage || mediaFallback,
      lastAt: item.lastAt || null,
      unreadCount: Number(item.unreadCount || 0)
    });
  }

  const q = normalizeSearchText(query);
  const filtered = !q
    ? merged
    : merged.filter((item) => {
      const hay = normalizeSearchText(`${item.userName} ${item.userEmail} ${item.userPhone} ${item.lastMessage}`);
      return hay.includes(q);
    });

  return filtered.sort((a, b) => {
    const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(a.userName || '').localeCompare(String(b.userName || ''), 'vi');
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
    userName: user.hoten || 'KhÃ¡ch hÃ ng',
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

