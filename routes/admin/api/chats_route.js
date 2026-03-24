const express = require('express');
const controller = require('../../../controllers/admin/api/chats_controller');
const { uploadChatMedia, MAX_CHAT_MEDIA_MB } = require('../../../middlewares/chatUpload');

const router = express.Router();

function uploadSingleMedia(req, res, next) {
  uploadChatMedia.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err && err.message === 'ONLY_IMAGE_OR_VIDEO') {
      return res.status(400).json({ success: false, message: 'Chi ho tro anh hoac video (mp4/webm/ogg/mov)' });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: `File qua lon, toi da ${MAX_CHAT_MEDIA_MB}MB` });
    }
    return res.status(400).json({ success: false, message: 'Upload that bai' });
  });
}

router.get('/conversations', controller.layDanhSachHoiThoai);
router.get('/unread-total', controller.layTongChuaDoc);
router.get('/messages/:userId', controller.layLichSuTheoUser);
router.post('/read/:userId', controller.danhDauDaDocTheoUser);
router.post('/upload', uploadSingleMedia, controller.uploadMedia);

module.exports = router;

