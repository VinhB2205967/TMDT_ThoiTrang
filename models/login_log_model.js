const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Nguoidung',
    required: false
  },
  email: {
    type: String,
    required: false
  },
  role: {
    type: String,
    default: 'user'
  },
  provider: {
    type: String,
    enum: ['local', 'google', 'admin'],
    default: 'local'
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    default: 'success'
  },
  ip: String,
  userAgent: String,
  message: String,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

loginLogSchema.index({ userId: 1, createdAt: -1 });
loginLogSchema.index({ email: 1, createdAt: -1 });

const LoginLog = mongoose.model('LoginLog', loginLogSchema, 'login_logs');
module.exports = LoginLog;
