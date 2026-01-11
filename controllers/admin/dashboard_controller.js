const Product = require('../../models/product_model');

//[GET] /admin/
module.exports.dashboard = async (req, res) => {
    try {
        // Thống kê sản phẩm
        const totalProducts = await Product.countDocuments({ daxoa: false });
        const activeProducts = await Product.countDocuments({ daxoa: false, trangthai: 'dangban' });
        const inactiveProducts = await Product.countDocuments({ daxoa: false, trangthai: 'ngungban' });
        
        // Sản phẩm hết hàng (tất cả sizes đều = 0)
        const allProducts = await Product.find({ daxoa: false, trangthai: 'dangban' }).lean();
        let outOfStockCount = 0;
        allProducts.forEach(p => {
            let totalStock = 0;
            if (p.sizes && p.sizes.length) {
                p.sizes.forEach(s => totalStock += (s.soluong || 0));
            }
            if (p.bienthe && p.bienthe.length) {
                p.bienthe.forEach(bt => {
                    if (bt.sizes && bt.sizes.length) {
                        bt.sizes.forEach(s => totalStock += (s.soluong || 0));
                    }
                });
            }
            if (totalStock === 0) outOfStockCount++;
        });

        // Sản phẩm mới nhất (5 sản phẩm)
        const recentProducts = await Product.find({ daxoa: false })
            .sort({ ngaytao: -1 })
            .limit(5)
            .lean();

        // Thống kê theo loại sản phẩm
        const productsByType = await Product.aggregate([
            { $match: { daxoa: false } },
            { $group: { _id: '$loaisanpham', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Thống kê theo giới tính
        const productsByGender = await Product.aggregate([
            { $match: { daxoa: false } },
            { $group: { _id: '$gioitinh', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        console.log('Dashboard stats:', { totalProducts, activeProducts, inactiveProducts, outOfStockCount });

        res.render("admin/pages/dashboard/index.pug", {
            titlePage: "Dashboard - Admin",
            stats: {
                totalProducts,
                activeProducts,
                inactiveProducts,
                outOfStockCount
            },
            recentProducts,
            productsByType,
            productsByGender
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render("admin/pages/dashboard/index.pug", {
            titlePage: "Dashboard - Admin",
            stats: {
                totalProducts: 0,
                activeProducts: 0,
                inactiveProducts: 0,
                outOfStockCount: 0
            },
            recentProducts: [],
            productsByType: [],
            productsByGender: []
        });
    }
}