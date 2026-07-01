const mongoose = require('mongoose');
const ChatMessage = require('../../models/chat_message_model');
const Setting = require('../../models/setting_model');
const { buildAdminAiSuggestion } = require('./admin-ai-chat.service');
const { taoTin } = require('./chat.service');

const AUTO_REPLY_SETTING_KEY = 'chat_auto_reply_config';
const DEFAULT_AUTO_REPLY_CONFIG = {
  enabled: false,
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  autoResponseDelay: 2000, // ms - delay before sending auto-reply
  minMessageLength: 1, // minimum characters to trigger auto-reply
  maxAutoRepliesPerDay: 100, // rate limiting
  excludeKeywords: [] // keywords that should NOT trigger auto-reply
};

function toOid(id) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function isKeywordExcluded(content, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return false;
  const normalizedContent = String(content || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  return keywords.some(keyword => {
    const normalizedKeyword = String(keyword || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return normalizedContent.includes(normalizedKeyword);
  });
}

/**
 * Get current auto-reply configuration
 */
async function getAutoReplyConfig() {
  try {
    const setting = await Setting.findOne({ key: AUTO_REPLY_SETTING_KEY }).lean();
    if (!setting || !setting.value) {
      return DEFAULT_AUTO_REPLY_CONFIG;
    }
    
    // Merge with defaults to ensure all properties exist
    return {
      ...DEFAULT_AUTO_REPLY_CONFIG,
      ...setting.value
    };
  } catch (error) {
    console.error('getAutoReplyConfig error:', error);
    return DEFAULT_AUTO_REPLY_CONFIG;
  }
}

/**
 * Update auto-reply configuration
 */
async function updateAutoReplyConfig(newConfig) {
  try {
    const merged = {
      ...DEFAULT_AUTO_REPLY_CONFIG,
      ...newConfig
    };

    await Setting.findOneAndUpdate(
      { key: AUTO_REPLY_SETTING_KEY },
      { $set: { value: merged } },
      { upsert: true, new: true }
    );

    return merged;
  } catch (error) {
    console.error('updateAutoReplyConfig error:', error);
    throw error;
  }
}

/**
 * Count auto-replies sent today for rate limiting
 */
async function countAutoRepliesToday() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const count = await ChatMessage.countDocuments({
      senderRole: 'admin',
      isAutoReply: true,
      sentAt: { $gte: today },
      daxoa: { $ne: true }
    });

    return count;
  } catch (error) {
    console.error('countAutoRepliesToday error:', error);
    return 0;
  }
}

/**
 * Check if a message should trigger auto-reply
 */
async function shouldAutoReply(clientMessage, config) {
  if (!config.enabled) return false;
  if (!clientMessage) return false;

  const content = String(clientMessage.content || '').trim();
  
  // Check minimum message length
  if (content.length < config.minMessageLength) return false;

  // Check excluded keywords
  if (isKeywordExcluded(content, config.excludeKeywords)) return false;

  // Check rate limiting
  const todayCount = await countAutoRepliesToday();
  if (todayCount >= config.maxAutoRepliesPerDay) return false;

  return true;
}

/**
 * Generate auto-reply for a client message
 */
async function generateAutoReply({ clientId, clientMessage, config }) {
  try {
    if (!config.enabled) {
      return { success: false, reason: 'Auto-reply disabled' };
    }

    // Validate inputs
    const clientObjectId = toOid(clientId);
    if (!clientObjectId) {
      return { success: false, reason: 'Invalid clientId' };
    }

    if (!clientMessage || !clientMessage._id) {
      return { success: false, reason: 'Invalid clientMessage' };
    }

    // Check if should auto-reply
    const canReply = await shouldAutoReply(clientMessage, config);
    if (!canReply) {
      return { success: false, reason: 'Message does not trigger auto-reply' };
    }

    // Generate AI suggestion
    const suggestion = await buildAdminAiSuggestion({
      userId: clientId,
      action: 'draft',
      provider: config.provider,
      model: config.model,
      historyLimit: 12
    });

    if (!suggestion || !suggestion.suggestion) {
      return { success: false, reason: 'Failed to generate AI suggestion' };
    }

    return {
      success: true,
      suggestion: suggestion.suggestion,
      meta: suggestion.meta
    };
  } catch (error) {
    console.error('generateAutoReply error:', error);
    return { success: false, reason: error.message || 'Unexpected error' };
  }
}

/**
 * Send auto-reply as an admin message
 */
async function sendAutoReply({ clientId, autoReplyContent, config }) {
  try {
    if (!autoReplyContent) {
      throw new Error('Missing auto-reply content');
    }

    // Find an admin user to send the message (use system admin or first admin)
    const Taikhoan = require('../../models/accounts_model');
    const admin = await Taikhoan.findOne({
      vaitro: 'admin',
      trangthai: 'active'
    })
      .select('_id')
      .lean();

    if (!admin) {
      return { success: false, reason: 'No active admin found' };
    }

    const adminId = String(admin._id);
    const clientObjectId = toOid(clientId);

    if (!clientObjectId) {
      return { success: false, reason: 'Invalid clientId' };
    }

    // Create and save the message
    const message = await taoTin({
      clientId,
      senderId: adminId,
      senderRole: 'admin',
      receiverId: clientObjectId,
      receiverRole: 'client',
      content: autoReplyContent
    });

    // Mark message as auto-reply (update after creation)
    await ChatMessage.findByIdAndUpdate(
      message._id,
      { isAutoReply: true },
      { new: true }
    );

    return {
      success: true,
      message: {
        ...message,
        isAutoReply: true
      }
    };
  } catch (error) {
    console.error('sendAutoReply error:', error);
    return { success: false, reason: error.message || 'Unexpected error' };
  }
}

/**
 * Handle incoming client message and trigger auto-reply if needed
 */
async function handleClientMessageForAutoReply(clientMessage) {
  try {
    // Get current config
    const config = await getAutoReplyConfig();
    
    if (!config.enabled) {
      return null;
    }

    // Check if should auto-reply
    const canReply = await shouldAutoReply(clientMessage, config);
    if (!canReply) {
      return null;
    }

    // Generate auto-reply
    const generationResult = await generateAutoReply({
      clientId: String(clientMessage.clientId),
      clientMessage,
      config
    });

    if (!generationResult.success) {
      console.warn('Auto-reply generation failed:', generationResult.reason);
      return null;
    }

    // Send with configured delay
    const delay = Number(config.autoResponseDelay || 2000);
    
    return {
      clientId: String(clientMessage.clientId),
      content: generationResult.suggestion,
      meta: generationResult.meta,
      sendAt: new Date(Date.now() + delay)
    };
  } catch (error) {
    console.error('handleClientMessageForAutoReply error:', error);
    return null;
  }
}

/**
 * Get auto-reply statistics (for admin dashboard)
 */
async function getAutoReplyStats() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayCount, totalCount] = await Promise.all([
      ChatMessage.countDocuments({
        isAutoReply: true,
        sentAt: { $gte: today },
        daxoa: { $ne: true }
      }),
      ChatMessage.countDocuments({
        isAutoReply: true,
        daxoa: { $ne: true }
      })
    ]);

    const config = await getAutoReplyConfig();

    return {
      enabled: config.enabled,
      todayCount,
      totalCount,
      dailyLimit: config.maxAutoRepliesPerDay,
      remainingToday: Math.max(0, config.maxAutoRepliesPerDay - todayCount)
    };
  } catch (error) {
    console.error('getAutoReplyStats error:', error);
    return {
      enabled: false,
      todayCount: 0,
      totalCount: 0,
      dailyLimit: 0,
      remainingToday: 0
    };
  }
}

module.exports = {
  getAutoReplyConfig,
  updateAutoReplyConfig,
  countAutoRepliesToday,
  shouldAutoReply,
  generateAutoReply,
  sendAutoReply,
  handleClientMessageForAutoReply,
  getAutoReplyStats,
  AUTO_REPLY_SETTING_KEY
};
