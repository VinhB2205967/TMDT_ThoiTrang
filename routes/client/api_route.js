const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const homeApi = require('../../controllers/client/api/home_api_controller');
const contentApi = require('../../controllers/client/api/content_api_controller');
const aiChatApi = require('../../controllers/client/api/ai_chat_api_controller');

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

module.exports = router;
