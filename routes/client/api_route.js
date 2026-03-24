const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../../middlewares/auth');
const homeApi = require('../../controllers/client/api/home_api_controller');
const aiChatApi = require('../../controllers/client/api/ai_chat_api_controller');
const favoritesApi = require('../../controllers/client/api/favorites_api_controller');
const voucherApi = require('../../controllers/client/api/voucher_api_controller');
const chatApi = require('../../controllers/client/api/chat_api_controller');
const cartApi = require('../../controllers/client/api/cart_api_controller');
const productsApi = require('../../controllers/client/api/products_api_controller');
const ordersApi = require('../../controllers/client/api/orders_api_controller');
const { uploadOpenclipQuery } = require('../../middlewares/openclipUpload');
const { uploadChatMedia, MAX_CHAT_MEDIA_MB } = require('../../middlewares/chatUpload');

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

function uploadSingleMedia(req, res, next) {
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

router.get('/favorites/ids', requireAuth, favoritesApi.layIds);
router.post('/favorites/add/:id', requireAuth, favoritesApi.them);
router.post('/favorites/remove/:id', requireAuth, favoritesApi.xoa);
router.post('/favorites/toggle/:id', requireAuth, favoritesApi.batTat);

router.get('/vouchers/available', requireAuth, voucherApi.available);
router.post('/vouchers/apply', requireAuth, voucherApi.apply);
router.post('/vouchers/save', requireAuth, voucherApi.save);

router.get('/chat/messages', requireAuth, chatApi.layLichSu);
router.get('/chat/unread-count', requireAuth, chatApi.laySoChuaDoc);
router.post('/chat/read', requireAuth, chatApi.danhDauDaDoc);
router.post('/chat/upload', requireAuth, uploadSingleMedia, chatApi.uploadMedia);

router.get('/products/suggest', productsApi.goiY);
router.get('/products/:id/options', productsApi.tuyChon);

router.post('/cart/add', requireAuth, cartApi.them);
router.post('/cart/buy-now', requireAuth, cartApi.muaNgay);
router.post('/cart/update', requireAuth, cartApi.capNhatSoLuong);
router.post('/cart/update-options', requireAuth, cartApi.capNhatTuyChon);
router.post('/cart/remove', requireAuth, cartApi.xoa);
router.post('/cart/clear', requireAuth, cartApi.xoaHet);

router.get('/orders/:id/payment-status', requireAuth, ordersApi.kiemTraThanhToan);

module.exports = router;
