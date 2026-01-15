const Product = require('../../models/product_model');
const productHelper = require('../../helpers/product');

//[GET] /
module.exports.index = async (req, res) => {
    try {
        const newProducts = await Product.find({ 
            trangthai: 'dangban',
            daxoa: false
        })
        .sort({ ngaytao: -1 })
        .limit(8)
        .lean();

        // Sản phẩm giảm giá (8 sản phẩm có giảm giá cao nhất)
        const discountProducts = await Product.find({ 
            trangthai: 'dangban',
            daxoa: false,
            phantramgiamgia: { $gt: 0 }
        })
        .sort({ phantramgiamgia: -1 })
        .limit(8)
        .lean();

        // Flash sale (sản phẩm giảm giá từ 30% trở lên)
        const flashSaleProducts = await Product.find({ 
            trangthai: 'dangban',
            daxoa: false,
            phantramgiamgia: { $gte: 30 }
        })
        .sort({ phantramgiamgia: -1 })
        .limit(8)
        .lean();
        // Best seller
        const bestSellerProducts = await Product.find({ 
            trangthai: 'dangban',
            daxoa: false
        })
        .sort({ luotmua: -1, ngaytao: -1 })
        .limit(8)
        .lean();

        if (process.env.NODE_ENV !== 'production') {
            console.log('Home - New products:', newProducts.length);
            console.log('Home - Discount products:', discountProducts.length);
        }

        res.render("client/pages/home/index.pug", {
            titlePage: "Fashion Store - Thời trang chất lượng",
            newProducts: newProducts.map(productHelper),
            discountProducts: discountProducts.map(productHelper),
            flashSaleProducts: flashSaleProducts.map(productHelper),
            bestSellerProducts: bestSellerProducts.map(productHelper)
        });
    } catch (error) {
        console.error('Home page error:', error);
        res.render("client/pages/home/index.pug", {
            titlePage: "Fashion Store",
            newProducts: [],
            discountProducts: [],
            flashSaleProducts: [],
            bestSellerProducts: []
        });
    }
}