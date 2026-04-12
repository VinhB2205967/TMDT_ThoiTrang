const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    alias: 'nguoidung_id',
    ref: 'Nguoidung',
    required: false
  },
  email: {
    type: String,
    alias: 'thu_dien_tu',
    required: false
  },
  role: {
    type: String,
    alias: 'vaitro',
    default: 'user'
  },
  provider: {
    type: String,
    alias: 'phuongthuc',

    enum: ['local', 'google', 'admin'],
    default: 'local'
  },
  status: {
    type: String,
    alias: 'trangthai',
    enum: ['success', 'failed'],
    default: 'success'
  },
  ip: { type: String, alias: 'diachi_ip' },
  userAgent: { type: String, alias: 'trinhduyet' },
  message: { type: String, alias: 'thongbao' },
  createdAt: {
    type: Date,
    alias: 'thoigiantao',
    default: Date.now,
    index: true
  }
});

loginLogSchema.index({ userId: 1, createdAt: -1 });
loginLogSchema.index({ email: 1, createdAt: -1 });

const LoginLog = mongoose.model('LoginLog', loginLogSchema, 'login_logs');
module.exports = LoginLog;
