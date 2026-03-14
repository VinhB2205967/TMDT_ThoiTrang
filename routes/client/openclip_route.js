const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/openclip_controller');
const { uploadOpenclipQuery } = require('../../middlewares/openclipUpload');

router.get('/openclip', controller.index);
router.post('/openclip/image-search', (req, res, next) => {
	uploadOpenclipQuery.single('image')(req, res, (err) => {
		if (!err) return next();
		if (err && err.message === 'ONLY_IMAGE') return res.redirect('/ai/openclip?error=only-image');
		if (err && err.code === 'LIMIT_FILE_SIZE') return res.redirect('/ai/openclip?error=file-too-large');
		return res.redirect('/ai/openclip?error=upload-failed');
	});
}, controller.searchByImagePage);

module.exports = router;
