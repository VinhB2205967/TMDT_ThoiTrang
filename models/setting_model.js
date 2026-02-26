const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

module.exports = mongoose.model('Setting', settingSchema, 'settings');
