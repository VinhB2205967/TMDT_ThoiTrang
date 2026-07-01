const express = require('express');
const controller = require('../../../controllers/admin/api/chats_controller');
const { uploadChatMedia, MAX_CHAT_MEDIA_MB } = require('../../../middlewares/chatUpload');

const router = express.Router();

function uploadSingleMedia(req, res, next) {
  uploadChatMedia.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err && err.message === 'ONLY_IMAGE_OR_VIDEO') {
      return res.status(400).json({ success: false, message: 'Chỉ hỗ trợ hình ảnh hoặc video (mp4/webm/ogg/mov)' });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: `File quá lớn, tối đa ${MAX_CHAT_MEDIA_MB}MB` });
    }
    return res.status(400).json({ success: false, message: 'Upload thất bại' });
  });
}

router.get('/conversations', controller.layDanhSachHoiThoai);
router.get('/unread-total', controller.layTongChuaDoc);
router.get('/messages/:userId', controller.layLichSuTheoUser);
router.post('/read/:userId', controller.danhDauDaDocTheoUser);
router.post('/upload', uploadSingleMedia, controller.uploadMedia);
router.post('/ai-suggest', controller.aiSuggest);

// Auto-reply endpoints
router.get('/auto-reply/settings', controller.getAutoReplySettings);
router.post('/auto-reply/settings', controller.updateAutoReplySettings);
router.get('/auto-reply/stats', controller.getAutoReplyStats);

module.exports = router;

