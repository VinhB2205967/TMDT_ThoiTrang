const sanpham = require('../../models/product_model');

// Dashboard
module.exports.bangDieuKhien = async (req, res) => {
    try {
        // Thống kê sản phẩm
        const tongsanpham = await sanpham.countDocuments({ daxoa: false });
        const sanphamdangban = await sanpham.countDocuments({ daxoa: false, trangthai: 'dangban' });
        const sanphamngungban = await sanpham.countDocuments({ daxoa: false, trangthai: 'ngungban' });
        
        // Sản phẩm hết hàng (tất cả sizes đều = 0)
        const tatcasanpham = await sanpham.find({ daxoa: false, trangthai: 'dangban' }).lean();
        let sosanphamhethang = 0;
        tatcasanpham.forEach(p => {
            let tongton = 0;
            if (p.sizes && p.sizes.length) {
                p.sizes.forEach(s => tongton += (s.soluong || 0));
            }
            if (p.bienthe && p.bienthe.length) {
                p.bienthe.forEach(bt => {
                    if (bt.sizes && bt.sizes.length) {
                        bt.sizes.forEach(s => tongton += (s.soluong || 0));
                    }
                });
            }
            if (tongton === 0) sosanphamhethang++;
        });

        // Sản phẩm mới nhất (5 sản phẩm)
        const sanphammoihat = await sanpham.find({ daxoa: false })
            .sort({ ngaytao: -1 })
            .limit(5)
            .lean();

        // Thống kê theo loại sản phẩm
        const thongketheoloai = await sanpham.aggregate([
            { $match: { daxoa: false } },
            { $group: { _id: '$loaisanpham', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Thống kê theo giới tính
        const thongketheogioitinh = await sanpham.aggregate([
            { $match: { daxoa: false } },
            { $group: { _id: '$gioitinh', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        console.log('Dashboard stats:', { tongsanpham, sanphamdangban, sanphamngungban, sosanphamhethang });
        // Hiển thị trang dashboard với dữ liệu thống kê
        res.render("admin/pages/dashboard/index.pug", {
            titlePage: "Dashboard - Admin",
            stats: {
                totalProducts: tongsanpham,
                activeProducts: sanphamdangban,
                inactiveProducts: sanphamngungban,
                outOfStockCount: sosanphamhethang
            },
            recentProducts: sanphammoihat,
            productsByType: thongketheoloai,
            productsByGender: thongketheogioitinh
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