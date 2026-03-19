const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const homeApi = require('../../controllers/client/api/home_api_controller');
const contentApi = require('../../controllers/client/api/content_api_controller');
const aiChatApi = require('../../controllers/client/api/ai_chat_api_controller');
const accountApi = require('../../controllers/client/api/account_api_controller');
const authApi = require('../../controllers/client/api/auth_api_controller');
const productApi = require('../../controllers/client/api/product_api_controller');
const cartApi = require('../../controllers/client/api/cart_api_controller');
const orderApi = require('../../controllers/client/api/order_api_controller');
const favoritesApi = require('../../controllers/client/api/favorites_api_controller');
const reviewsApi = require('../../controllers/client/api/reviews_api_controller');
const voucherApi = require('../../controllers/client/api/voucher_api_controller');
const chatController = require('../../controllers/client/chat_controller');
const { uploadOpenclipQuery } = require('../../middlewares/openclipUpload');
const { uploadChatMedia, MAX_CHAT_MEDIA_MB } = require('../../middlewares/chatUpload');
const { requireAuth } = require('../../middlewares/auth');

const aiChatLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 20,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Bạn gửi quá nhanh, vui lòng thử lại sau ít giây'
	}
});

function uploadSingleChatMedia(req, res, next) {
	uploadChatMedia.single('file')(req, res, (err) => {
		if (!err) return next();
		if (err && err.message === 'ONLY_IMAGE_OR_VIDEO') {
			return res.status(400).json({ success: false, message: 'Chỉ hỗ trợ ảnh hoặc video (mp4/webm/ogg/mov)' });
		}
		if (err && err.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({ success: false, message: `File quá lớn, tối đa ${MAX_CHAT_MEDIA_MB}MB` });
		}
		return res.status(400).json({ success: false, message: 'Upload thất bại' });
	});
}

router.get('/home', homeApi.getHome);

// Auth REST API
router.post('/auth/register', authApi.register);
router.post('/auth/login', authApi.login);
router.post('/auth/logout', requireAuth, authApi.logout);
router.post('/auth/forgot-password', authApi.forgotPassword);
router.post('/auth/reset-password', authApi.resetPassword);

// Account REST API
router.get('/account/profile', requireAuth, accountApi.getProfile);
router.patch('/account/profile', requireAuth, accountApi.updateProfile);
router.post('/account/change-password', requireAuth, accountApi.changePassword);
router.delete('/account', requireAuth, accountApi.deleteAccount);

// Product REST API
router.get('/products', productApi.list);
router.get('/products/:id', productApi.detail);
router.get('/products/:id/options', productApi.options);

// Cart REST API
router.get('/cart', requireAuth, cartApi.getCart);
router.post('/cart/items', requireAuth, cartApi.addItem);
router.patch('/cart/items/:itemId', requireAuth, cartApi.updateItem);
router.delete('/cart/items/:itemId', requireAuth, cartApi.removeItem);
router.delete('/cart/items', requireAuth, cartApi.clearCart);

// Order REST API
router.get('/orders', requireAuth, orderApi.listMyOrders);
router.get('/orders/:id', requireAuth, orderApi.getOrderDetail);

// Favorites REST API
router.get('/favorites', requireAuth, favoritesApi.list);
router.get('/favorites/ids', requireAuth, favoritesApi.ids);
router.post('/favorites/:productId', requireAuth, favoritesApi.add);
router.delete('/favorites/:productId', requireAuth, favoritesApi.remove);
router.post('/favorites/:productId/toggle', requireAuth, favoritesApi.toggle);

// Reviews REST API
router.get('/reviews/products/:productId', reviewsApi.listByProduct);
router.post('/reviews', requireAuth, reviewsApi.create);
router.patch('/reviews/:id', requireAuth, reviewsApi.update);
router.delete('/reviews/:id', requireAuth, reviewsApi.remove);

// Voucher REST API
router.get('/vouchers/available', requireAuth, voucherApi.listAvailable);
router.post('/vouchers/save', requireAuth, voucherApi.saveVoucher);
router.post('/vouchers/apply', requireAuth, voucherApi.applyVoucher);

// Chat REST API
router.get('/chat/messages', requireAuth, chatController.layLichSu);
router.get('/chat/unread-count', requireAuth, chatController.laySoChuaDoc);
router.post('/chat/read', requireAuth, chatController.danhDauDaDoc);
router.post('/chat/upload', requireAuth, uploadSingleChatMedia, chatController.uploadMedia);

router.get('/banners', contentApi.getBanners);
router.get('/flash-sale/active', contentApi.getFlashSale);
router.get('/lookbooks', contentApi.getLookbooks);
router.get('/lookbooks/list', contentApi.listLookbooks);
router.get('/lookbooks/slug/:slug', contentApi.getLookbookDetailBySlug);
router.get('/lookbooks/:id', contentApi.getLookbookDetail);
router.get('/brands/featured', contentApi.getFeaturedBrands);
router.get('/brands', contentApi.listBrands);
router.get('/brands/:slug', contentApi.getBrandDetail);
router.get('/blog', contentApi.getBlogs);
router.get('/blog/posts', contentApi.listBlogPosts);
router.get('/blog/posts/:slug', contentApi.getBlogDetail);
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


