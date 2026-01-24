const sanpham = require('../../models/product_model');
const productHelper = require('../../helpers/product');

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

    res.render("client/pages/home/index.pug", {
        titlePage: "Fashion Store - Thời trang chất lượng",
        newProducts: sanphammoi.map(productHelper),
        discountProducts: sanphamgiamgia.map(productHelper),
        flashSaleProducts: sanphamflashsale.map(productHelper),
        bestSellerProducts: sanphambanchay.map(productHelper)
    });
}