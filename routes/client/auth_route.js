const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/auth_controller');

router.get(['/auth', '/login', '/register'], controller.page);

router.post('/auth/register', controller.register);
router.post('/auth/login', controller.login);
router.post('/auth/logout', controller.logout);

router.get('/auth/google', controller.googleStart);
router.get('/auth/google/callback', controller.googleCallback);

module.exports = router;
