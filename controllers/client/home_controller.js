const sanpham = require('../../models/product_model');
const productHelper = require('../../helpers/product');
const { buildProductStats, applyProductStats } = require('../../helpers/productStats');

// Trang chủ
module.exports.trangChu = async (req, res) => {
    const sanphammoi = await sanpham.find({ 
        trangthai: 'dangban',
        daxoa: false
    })
    .sort({ ngaytao: -1 })
    .limit(8)
    .lean();

    // Sản phẩm giảm giá (8 sản phẩm có giảm giá cao nhất)
    const sanphamgiamgia = await sanpham.find({ 
        trangthai: 'dangban',
        daxoa: false,
        phantramgiamgia: { $gt: 0 }
    })
    .sort({ phantramgiamgia: -1 })
    .limit(8)
    .lean();

    // Flash sale (sản phẩm giảm giá từ 30% trở lên)
    const sanphamflashsale = await sanpham.find({ 
        trangthai: 'dangban',
        daxoa: false,
        phantramgiamgia: { $gte: 30 }
    })
    .sort({ phantramgiamgia: -1 })
    .limit(8)
    .lean();
    // Best seller
    const sanphambanchay = await sanpham.find({ 
        trangthai: 'dangban',
        daxoa: false
    })
    .sort({ luotmua: -1, ngaytao: -1 })
    .limit(8)
    .lean();

    if (process.env.NODE_ENV !== 'production') {
        console.log('Home - New products:', sanphammoi.length);
        console.log('Home - Discount products:', sanphamgiamgia.length);
    }

    const allIds = [
        ...sanphammoi,
        ...sanphamgiamgia,
        ...sanphamflashsale,
        ...sanphambanchay
    ].map(p => p && p._id).filter(Boolean);
    const { ratingMap, soldMap } = await buildProductStats(allIds);

    res.render("client/pages/home/index.pug", {
        titlePage: "Fashion Store - Thời trang chất lượng",
        newProducts: applyProductStats(sanphammoi.map(productHelper), ratingMap, soldMap),
        discountProducts: applyProductStats(sanphamgiamgia.map(productHelper), ratingMap, soldMap),
        flashSaleProducts: applyProductStats(sanphamflashsale.map(productHelper), ratingMap, soldMap),
        bestSellerProducts: applyProductStats(sanphambanchay.map(productHelper), ratingMap, soldMap)
    });
}