const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/chat_controller');
const { uploadChatMedia } = require('../../middlewares/chatUpload');

function uploadSingleMedia(req, res, next) {
	uploadChatMedia.single('file')(req, res, (err) => {
		if (!err) return next();
		if (err && err.message === 'ONLY_IMAGE_OR_VIDEO') {
			return res.status(400).json({ success: false, message: 'Chỉ hỗ trợ ảnh hoặc video (mp4/webm/ogg/mov)' });
		}
		if (err && err.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({ success: false, message: 'File quá lớn, tối đa 20MB' });
		}
		return res.status(400).json({ success: false, message: 'Upload thất bại' });
	});
}

router.get('/', controller.trangChat);
router.get('/api/conversations', controller.layDanhSachHoiThoai);
router.get('/api/unread-total', controller.layTongChuaDoc);
router.get('/api/messages/:userId', controller.layLichSuTheoUser);
router.post('/api/read/:userId', controller.danhDauDaDocTheoUser);
router.post('/api/upload', uploadSingleMedia, controller.uploadMedia);

module.exports = router;
