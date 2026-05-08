const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/openclip_controller');
const { uploadOpenclipQuery, validateOpenclipQueryFile } = require('../../middlewares/openclipUpload');

router.get('/openclip', controller.index);
router.post('/openclip/image-search', (req, res, next) => {
	uploadOpenclipQuery.single('image')(req, res, (err) => {
		if (!err) {
			return validateOpenclipQueryFile(req, res, (validationErr) => {
				if (!validationErr) return next();
				return res.redirect('/ai/openclip?error=unsupported-image');
			});
		}
		if (err && err.message === 'ONLY_IMAGE') return res.redirect('/ai/openclip?error=only-image');
		if (err && err.message === 'UNSUPPORTED_IMAGE_TYPE') return res.redirect('/ai/openclip?error=unsupported-image');
		if (err && err.code === 'LIMIT_FILE_SIZE') return res.redirect('/ai/openclip?error=file-too-large');
		return res.redirect('/ai/openclip?error=upload-failed');
	});
}, controller.searchByImagePage);

module.exports = router;
