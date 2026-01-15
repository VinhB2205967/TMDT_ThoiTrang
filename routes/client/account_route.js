const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/account_controller');
const { requireAuth } = require('../../middlewares/auth');
const multer = require('multer');
const path = require('path');

const AVATAR_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars');

const storage = multer.diskStorage({
	destination: function (_req, _file, cb) {
		cb(null, AVATAR_DIR);
	},
	filename: function (req, file, cb) {
		const userId = req.user && req.user._id ? String(req.user._id) : 'user';
		const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
		const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
		cb(null, `${userId}-${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
	}
});

const uploadAvatar = multer({
	storage,
	limits: { fileSize: 2 * 1024 * 1024 },
	fileFilter: function (_req, file, cb) {
		const ok = /^image\//.test(String(file.mimetype || ''));
		cb(ok ? null : new Error('ONLY_IMAGE'), ok);
	}
});

router.get('/account', requireAuth, controller.page);
router.post('/account/profile', requireAuth, uploadAvatar.single('avatarFile'), controller.updateProfile);
router.post('/account/password', requireAuth, controller.changePassword);
router.post('/account/delete', requireAuth, controller.deleteAccount);

module.exports = router;
