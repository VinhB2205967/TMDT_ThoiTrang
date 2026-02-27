const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    required: true
  },
  senderRole: {
    type: String,
    enum: ['admin', 'client'],
    required: true,
    index: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    default: null
  },
  receiverRole: {
    type: String,
    enum: ['admin', 'client'],
    required: true
  },
  content: {
    type: String,
    default: '',
    trim: true,
    maxlength: 2000
  },
  mediaUrl: {
    type: String,
    default: ''
  },
  mediaType: {
    type: String,
    enum: ['', 'image', 'video'],
    default: ''
  },
  mediaMime: {
    type: String,
    default: ''
  },
  mediaName: {
    type: String,
    default: ''
  },
  mediaSize: {
    type: Number,
    default: 0
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: Date,
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  daxoa: {
    type: Boolean,
    default: false,
    index: true
  }
});

chatMessageSchema.index({ clientId: 1, sentAt: -1 });
chatMessageSchema.index({ clientId: 1, senderRole: 1, isRead: 1 });

chatMessageSchema.pre('validate', function () {
  const hasText = String(this.content || '').trim().length > 0;
  const hasMedia = String(this.mediaUrl || '').trim().length > 0;
  if (!hasText && !hasMedia) {
    this.invalidate('content', 'Tin nhắn phải có nội dung hoặc tệp đính kèm');
  }
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema, 'chat_messages');
module.exports = ChatMessage;
