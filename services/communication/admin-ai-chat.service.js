const mongoose = require('mongoose');
const ChatMessage = require('../../models/chat_message_model');
const { buildDataContext, askAI } = require('../content/aiChat.service');

const DEFAULT_HISTORY_LIMIT = 12;
const MAX_HISTORY_LIMIT = 30;

function toOid(id) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function normalizeAction(action) {
  const value = String(action || '').toLowerCase().trim();
  if (value === 'summary') return 'summary';
  if (value === 'followup') return 'followup';
  return 'draft';
}

function normalizeMessage(content) {
  return String(content || '').trim();
}

function buildHistoryItem(message) {
  if (!message) return null;
  const role = message.senderRole === 'admin' ? 'assistant' : 'user';
  const text = normalizeMessage(message.content);
  if (text) {
    return { role, content: text };
  }

  if (message.mediaUrl) {
    const mediaLabel = message.mediaType === 'video' ? '[Video]' : '[Hinh anh]';
    return { role, content: mediaLabel };
  }

  return null;
}

function buildHistory(messages, limit) {
  const safeLimit = Math.min(MAX_HISTORY_LIMIT, Math.max(4, Number(limit || DEFAULT_HISTORY_LIMIT)));
  const rows = Array.isArray(messages) ? messages.slice(-safeLimit) : [];
  return rows
    .map(buildHistoryItem)
    .filter((item) => item && item.content);
}

function getLastClientMessage(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const row = list[i];
    if (!row || row.senderRole !== 'client') continue;
    const text = normalizeMessage(row.content);
    if (text) return text;
    if (row.mediaUrl) return row.mediaType === 'video' ? '[Khach gui video]' : '[Khach gui hinh anh]';
  }
  return '';
}

function buildSystemPrompt(action) {
  if (action === 'summary') {
    return [
      'Ban la tro ly AI ho tro nhan vien CSKH.',
      'Hay tom tat cuoc hoi thoai gan nhat bang tieng Viet, gon gang.',
      'Chi neu cac y chinh: van de, nhu cau, san pham/de đơn hang lien quan, tinh trang xu ly.',
      'Neu chua co thong tin can thiet, hay ghi ro can bo sung gi.',
      'Khong nhac den JSON, context, hay he thong noi bo.'
    ].join(' ');
  }

  if (action === 'followup') {
    return [
      'Ban la tro ly AI ho tro nhan vien CSKH.',
      'Hay de xuat 3 cau hoi ngan gon de hoi them khach hang, bang tieng Viet.',
      'Cau hoi can cu the, de dang tra loi, khong lap lai noi dung khach da noi.',
      'Khong nhac den JSON, context, hay he thong noi bo.'
    ].join(' ');
  }

  return [
    'Ban la tro ly AI ho tro nhan vien CSKH.',
    'Hay soan 1 cau tra loi de gui cho khach hang, bang tieng Viet, lich su va du lieu co san.',
    'Cau tra loi can lich su, than thien, ro rang, ngan gon.',
    'Neu thieu thong tin, hay hoi them 1-2 cau hoi cu the.',
    'Khong nhac den JSON, context, hay he thong noi bo.'
  ].join(' ');
}

function buildQuestion({ action, lastClientMessage }) {
  if (action === 'summary') {
    return 'Tom tat cuoc hoi thoai gan day cho nhan vien CSKH.';
  }
  if (action === 'followup') {
    return 'De xuat cau hoi de lam ro nhu cau cua khach hang.';
  }

  if (lastClientMessage) return lastClientMessage;
  return 'Soan cau tra loi lich su de CSKH gui cho khach hang.';
}

async function getConversationMessages({ userId, limit }) {
  const clientObjectId = toOid(userId);
  if (!clientObjectId) return [];

  const cappedLimit = Math.min(MAX_HISTORY_LIMIT, Math.max(4, Number(limit || DEFAULT_HISTORY_LIMIT)));
  const rows = await ChatMessage.find({
    clientId: clientObjectId,
    daxoa: { $ne: true }
  })
    .sort({ sentAt: -1, _id: -1 })
    .limit(cappedLimit)
    .lean();

  return (rows || []).reverse();
}

async function buildAdminAiSuggestion({ userId, action, provider, model, historyLimit }) {
  const safeAction = normalizeAction(action);
  const messages = await getConversationMessages({ userId, limit: historyLimit });
  const lastClientMessage = getLastClientMessage(messages);
  const question = buildQuestion({ action: safeAction, lastClientMessage });

  const context = await buildDataContext({
    question,
    userId,
    useOpenClip: false
  });

  const history = buildHistory(messages, historyLimit);
  const systemPrompt = buildSystemPrompt(safeAction);
  const ai = await askAI({
    question,
    history,
    context,
    provider,
    model,
    systemPrompt
  });

  return {
    suggestion: normalizeMessage(ai && ai.content),
    meta: {
      provider: ai && ai.provider ? String(ai.provider) : '',
      model: ai && ai.model ? String(ai.model) : '',
      action: safeAction,
      historyUsed: history.length
    }
  };
}

module.exports = {
  buildAdminAiSuggestion
};