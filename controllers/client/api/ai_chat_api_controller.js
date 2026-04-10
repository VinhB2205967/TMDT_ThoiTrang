const aiChatApiService = require('../../../services/content/ai-chat-api.service');

module.exports.sendMessage = aiChatApiService.sendMessage;
module.exports.searchOpenClip = aiChatApiService.searchOpenClip;
module.exports.searchOpenClipByImage = aiChatApiService.searchOpenClipByImage;
