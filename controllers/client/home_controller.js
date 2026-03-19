const productHelper = require('../../helpers/product');
const { buildProductStats, applyProductStats } = require('../../helpers/productStats');
const { getHomeData } = require('../../services/content/home.service.js');

function buildBadges(product) {
    const badges = [];
    const now = Date.now();
    const createdAt = product.ngaytao ? new Date(product.ngaytao).getTime() : 0;
    const isNew = createdAt && (now - createdAt) <= 14 * 24 * 60 * 60 * 1000;
    const isSale = Number(product.phantramgiamgia) > 0 || Number(product.flashSalePrice) > 0;
    const soldCount = Number(product.soldCount || product.luotmua || 0);
    const isHot = soldCount >= 10;

    if (isNew) badges.push('NEW');
    if (isSale) badges.push('SALE');
    if (isHot) badges.push('HOT');
    return badges;
}

// Trang chủ
module.exports.trangChu = async (req, res) => {
    const homeData = await getHomeData();

    const flashProducts = homeData.flashSale ? homeData.flashSale.products : [];
    const allIds = [
        ...homeData.newProducts,
        ...homeData.bestSellers,
        ...flashProducts
    ].map((p) => p && p._id).filter(Boolean);

    const { ratingMap, soldMap } = await buildProductStats(allIds);

    const withStats = (list) => applyProductStats(list.map(productHelper), ratingMap, soldMap)
        .map((p) => ({ ...p, badges: buildBadges(p) }));

    const newProducts = withStats(homeData.newProducts);
    const bestSellerProducts = withStats(homeData.bestSellers);
    const flashSaleProducts = withStats(flashProducts);
    const lookbooks = (homeData.lookbooks || []).map((book) => ({
        ...book,
        title: book.title || book.tenmua || '',
        image: book.image || book.hinhanh || '',
        description: book.description || book.mota || '',
        products: Array.isArray(book.products) && book.products.length ? book.products : (book.sanpham_ids || [])
    }));

    const flashSaleEnd = homeData.flashSale?.sale?.ketthuc
        ? new Date(homeData.flashSale.sale.ketthuc).toISOString()
        : '';
    const flashSaleStart = homeData.flashSale?.sale?.batdau
        ? new Date(homeData.flashSale.sale.batdau).toISOString()
        : '';

    res.render("client/pages/home/index.pug", {
        titlePage: "Fashion Store - Thời trang chất lượng",
        sections: homeData.sections.filter((s) => s.hienthi),
        banners: homeData.banners,
        flashSale: homeData.flashSale,
        flashSaleEnd,
        flashSaleStart,
        newProducts,
        bestSellerProducts,
        lookbooks,
        brands: homeData.brands,
        blogs: homeData.blogs,
        flashSaleProducts
    });
}