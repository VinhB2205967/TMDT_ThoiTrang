const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    alias: 'khachhang_id',
    ref: 'Nguoidung',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    alias: 'nguoigui_id',
    ref: 'Nguoidung',
    required: true
  },
  senderRole: {
    type: String,
    alias: 'vaitro_nguoigui',
    enum: ['admin', 'client'],
    required: true,
    index: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    alias: 'nguoinhan_id',
    ref: 'Nguoidung',
    default: null
  },
  receiverRole: {
    type: String,
    alias: 'vaitro_nguoinhan',
    enum: ['admin', 'client'],
    required: true
  },
  content: {
    type: String,
    alias: 'noidung',
    default: '',
    trim: true,
    maxlength: 2000
  },
  mediaUrl: {
    type: String,
    alias: 'tepdinhkem_url',
    default: ''
  },
  mediaType: {
    type: String,
    alias: 'tepdinhkem_loai',
    enum: ['', 'image', 'video'],
    default: ''
  },
  mediaMime: {
    type: String,
    alias: 'tepdinhkem_mime',
    default: ''
  },
  mediaName: {
    type: String,
    alias: 'tepdinhkem_ten',
    default: ''
  },
  mediaSize: {
    type: Number,
    alias: 'tepdinhkem_kichthuoc',
    default: 0
  },
  isRead: {
    type: Boolean,
    alias: 'dadoc',
    default: false,
    index: true
  },
  readAt: { type: Date, alias: 'thoigiandoc' },
  sentAt: {
    type: Date,
    alias: 'thoigiangui',
    default: Date.now,
    index: true
  },
  isAutoReply: {
    type: Boolean,
    alias: 'tu_tra_loi',
    default: false,
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
chatMessageSchema.index({ isAutoReply: 1, sentAt: -1 });

chatMessageSchema.pre('validate', function () {
  const hasText = String(this.content || '').trim().length > 0;
  const hasMedia = String(this.mediaUrl || '').trim().length > 0;
  if (!hasText && !hasMedia) {
    this.invalidate('content', 'Tin nhắn phải có nội dung hoặc tệp đính kèm');
  }
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema, 'chat_messages');
module.exports = ChatMessage;
