const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middlewares/auth');
const controller = require('../../controllers/client/cart_controller');

router.get('/', requireAuth, controller.index);
router.post('/add', requireAuth, controller.add);
router.post('/buy-now', requireAuth, controller.buyNow);
router.post('/update', requireAuth, controller.updateQty);
router.post('/update-options', requireAuth, controller.updateOptions);
router.post('/remove', requireAuth, controller.remove);
router.post('/clear', requireAuth, controller.clear);
router.get('/checkout', requireAuth, controller.checkoutPage);
router.post('/checkout', requireAuth, controller.checkoutSubmit);

module.exports = router;
