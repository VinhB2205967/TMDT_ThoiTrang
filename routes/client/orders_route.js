const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middlewares/auth');
const controller = require('../../controllers/client/orders_controller');
const { createMediaUpload } = require('../admin/_upload');

const uploadReturnProof = createMediaUpload('returns', { maxSize: 20 * 1024 * 1024, maxFiles: 5 });

function uploadReturnProofSingle(req, res, next) {
	uploadReturnProof.array('proofMedia', 5)(req, res, (err) => {
		if (!err) return next();

		if (err && err.message === 'ONLY_IMAGE_OR_VIDEO') {
			req.flash?.('error', 'Minh chứng chỉ hỗ trợ ảnh hoặc video.');
			return res.redirect(`/orders/${req.params.id}`);
		}

		if (err && err.code === 'LIMIT_FILE_SIZE') {
			req.flash?.('error', 'File minh chứng quá lớn. Tối đa 20MB.');
			return res.redirect(`/orders/${req.params.id}`);
		}

		if (err && (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')) {
			req.flash?.('error', 'Bạn chỉ có thể tải tối đa 5 file minh chứng.');
			return res.redirect(`/orders/${req.params.id}`);
		}

		req.flash?.('error', 'Upload minh chứng thất bại. Vui lòng thử lại.');
		return res.redirect(`/orders/${req.params.id}`);
	});
}

router.get('/', requireAuth, controller.danhSach);
router.get('/:id', requireAuth, controller.chiTiet);
router.post('/:id/cancel', requireAuth, controller.huyDon);
router.post('/:id/return-request', requireAuth, uploadReturnProofSingle, controller.yeuCauHoanHang);
router.post('/:id/reorder', requireAuth, controller.muaLai);
router.post('/:id/pay', requireAuth, controller.thanhToanLai);
router.post('/:id/change-payment', requireAuth, controller.doiPhuongThucThanhToan);

module.exports = router;
