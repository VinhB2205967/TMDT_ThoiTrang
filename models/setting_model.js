const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, alias: 'khoa' },
  value: { type: mongoose.Schema.Types.Mixed, alias: 'giatri' }
}, {
  timestamps: { createdAt: 'ngaytao', updatedAt: 'ngaycapnhat' }
});

module.exports = mongoose.model('Setting', settingSchema, 'settings');
