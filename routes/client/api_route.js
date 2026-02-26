const express = require('express');
const router = express.Router();
const homeApi = require('../../controllers/client/api/home_api_controller');
const contentApi = require('../../controllers/client/api/content_api_controller');

router.get('/home', homeApi.getHome);
router.get('/banners', contentApi.getBanners);
router.get('/flash-sale/active', contentApi.getFlashSale);
router.get('/lookbooks', contentApi.getLookbooks);
router.get('/lookbooks/:id', contentApi.getLookbookDetail);
router.get('/brands/featured', contentApi.getFeaturedBrands);
router.get('/blog', contentApi.getBlogs);

module.exports = router;
