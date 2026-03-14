const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const homeApi = require('../../controllers/client/api/home_api_controller');
const contentApi = require('../../controllers/client/api/content_api_controller');
const aiChatApi = require('../../controllers/client/api/ai_chat_api_controller');
const { uploadOpenclipQuery } = require('../../middlewares/openclipUpload');

const aiChatLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 20,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Ban gui qua nhanh, vui long thu lai sau it giay'
	}
});

router.get('/home', homeApi.getHome);
router.get('/banners', contentApi.getBanners);
router.get('/flash-sale/active', contentApi.getFlashSale);
router.get('/lookbooks', contentApi.getLookbooks);
router.get('/lookbooks/:id', contentApi.getLookbookDetail);
router.get('/brands/featured', contentApi.getFeaturedBrands);
router.get('/blog', contentApi.getBlogs);
router.post('/ai-chat/message', aiChatLimiter, aiChatApi.sendMessage);
router.post('/openclip/search', aiChatLimiter, aiChatApi.searchOpenClip);
router.post('/openclip/search-by-image', aiChatLimiter, (req, res, next) => {
	uploadOpenclipQuery.single('image')(req, res, (err) => {
		if (!err) return next();
		if (err && err.message === 'ONLY_IMAGE') {
			return res.status(400).json({ success: false, message: 'Chỉ hỗ trợ file ảnh (jpg, png, webp...)' });
		}
		if (err && err.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({ success: false, message: 'Ảnh quá lớn (tối đa 10MB)' });
		}
		return res.status(400).json({ success: false, message: 'Upload ảnh thất bại' });
	});
}, aiChatApi.searchOpenClipByImage);

module.exports = router;
