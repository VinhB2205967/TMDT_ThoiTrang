const mongoose = require('mongoose');
const ChatMessage = require('../../models/chat_message_model');
const Nguoidung = require('../../models/user_model');
const Taikhoan = require('../../models/accounts_model');

const PHONG_ADMIN = 'admin_room';

function toOid(id) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}
// Chuẩn hóa dữ liệu tin nhắn trước khi trả về client hoặc admin
function chuanTin(doc) {
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

async function taoTin({
  clientId,
  senderId,
  senderRole,
  receiverId = null,
  receiverRole,
  content,
  media = null
}) {
  const clientObjectId = toOid(clientId);
  const senderObjectId = toOid(senderId);
  const receiverObjectId = receiverId ? toOid(receiverId) : null;
  const text = String(content || '').trim();
  const mediaUrl = media && media.url ? String(media.url).trim() : '';
  const mediaType = media && media.type ? String(media.type).trim() : '';

  if (!clientObjectId || !senderObjectId || (!text && !mediaUrl)) {
    throw new Error('Dữ liệu tin nhắn không hợp lệ  (clientId, senderId, content/mediaUrl)');
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

  return chuanTin(created);
}

async function layTinHoiThoai({ clientId, limit = 50 }) {
  const clientObjectId = toOid(clientId);
  if (!clientObjectId) return [];

  const cappedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const rows = await ChatMessage.find({
    clientId: clientObjectId,
    daxoa: { $ne: true }
  })
    .sort({ sentAt: -1, _id: -1 })
    .limit(cappedLimit)
    .lean();

  return rows.reverse().map(chuanTin);
}

async function clientDaDoc({ clientId }) {
  const clientObjectId = toOid(clientId);
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

async function adminDaDoc({ clientId }) {
  const clientObjectId = toOid(clientId);
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

async function demChuaDocClient({ clientId }) {
  const clientObjectId = toOid(clientId);
  if (!clientObjectId) return 0;

  return ChatMessage.countDocuments({
    clientId: clientObjectId,
    senderRole: 'admin',
    isRead: false,
    daxoa: { $ne: true }
  });
}

async function demChuaDocAdmin() {
  return ChatMessage.countDocuments({
    senderRole: 'client',
    isRead: false,
    daxoa: { $ne: true }
  });
}

function chuanTim(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function layTomTatHoiThoaiAdmin({ query = '' } = {}) {
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

  const clientObjectIds = (rows || [])
    .map((item) => toOid(item && (item.clientId || item._id)))
    .filter(Boolean);

  const adminAccounts = clientObjectIds.length
    ? await Taikhoan.find({
      nguoidung_id: { $in: clientObjectIds },
      vaitro: 'admin'
    }).select('nguoidung_id').lean()
    : [];

  const adminClientIdSet = new Set(
    (adminAccounts || []).map((item) => String(item.nguoidung_id || ''))
  );

  const merged = (rows || []).map((item) => {
    const clientId = String(item.clientId || item._id || '');
    const summaryMessage = item.lastMessage || '';
    const mediaFallback = item.lastMediaType === 'video'
      ? '[Video]'
      : item.lastMediaType === 'image'
        ? '[Hình ảnh]'
        : '';

    return {
      clientId,
      userName: item.user && item.user.hoten ? item.user.hoten : 'Khách hàng',
      userEmail: item.user && item.user.email ? item.user.email : '',
      userPhone: item.user && item.user.sodienthoai ? item.user.sodienthoai : '',
      avatar: item.user && item.user.avatar ? item.user.avatar : '/images/avatar/avatar.png',
      lastMessage: summaryMessage || mediaFallback,
      lastAt: item.lastAt || null,
      unreadCount: Number(item.unreadCount || 0)
    };
  }).filter((item) => item.clientId && !adminClientIdSet.has(item.clientId));

  const q = chuanTim(query);
  const filtered = !q
    ? merged
    : merged.filter((item) => {
      const hay = chuanTim(`${item.userName} ${item.userEmail} ${item.userPhone} ${item.lastMessage}`);
      return hay.includes(q);
    });

  return filtered.sort((a, b) => {
    const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(a.userName || '').localeCompare(String(b.userName || ''), 'vi');
  });
}

async function layUserCoBan(userId) {
  const objectId = toOid(userId);
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
  PHONG_ADMIN,
  taoTin,
  layTinHoiThoai,
  clientDaDoc,
  adminDaDoc,
  demChuaDocClient,
  demChuaDocAdmin,
  layTomTatHoiThoaiAdmin,
  layUserCoBan
};

