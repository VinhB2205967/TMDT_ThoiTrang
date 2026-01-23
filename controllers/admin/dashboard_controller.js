const Product = require('../../models/product_model');

// Dashboard
module.exports.bangDieuKhien = async (req, res) => {
    try {
        // Thống kê sản phẩm
        const tongSanPham = await Product.countDocuments({ daxoa: false });
        const sanPhamDangBan = await Product.countDocuments({ daxoa: false, trangthai: 'dangban' });
        const sanPhamNgungBan = await Product.countDocuments({ daxoa: false, trangthai: 'ngungban' });
        
        // Sản phẩm hết hàng (tất cả sizes đều = 0)
        const tatCaSanPham = await Product.find({ daxoa: false, trangthai: 'dangban' }).lean();
        let soSanPhamHetHang = 0;
        tatCaSanPham.forEach(p => {
            let tongTon = 0;
            if (p.sizes && p.sizes.length) {
                p.sizes.forEach(s => tongTon += (s.soluong || 0));
            }
            if (p.bienthe && p.bienthe.length) {
                p.bienthe.forEach(bt => {
                    if (bt.sizes && bt.sizes.length) {
                        bt.sizes.forEach(s => tongTon += (s.soluong || 0));
                    }
                });
            }
            if (tongTon === 0) soSanPhamHetHang++;
        });

        // Sản phẩm mới nhất (5 sản phẩm)
        const sanPhamMoiNhat = await Product.find({ daxoa: false })
            .sort({ ngaytao: -1 })
            .limit(5)
            .lean();

        // Thống kê theo loại sản phẩm
        const thongKeTheoLoai = await Product.aggregate([
            { $match: { daxoa: false } },
            { $group: { _id: '$loaisanpham', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Thống kê theo giới tính
        const thongKeTheoGioiTinh = await Product.aggregate([
            { $match: { daxoa: false } },
            { $group: { _id: '$gioitinh', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        console.log('Dashboard stats:', { tongSanPham, sanPhamDangBan, sanPhamNgungBan, soSanPhamHetHang });
        // Hiển thị trang dashboard với dữ liệu thống kê
        res.render("admin/pages/dashboard/index.pug", {
            titlePage: "Dashboard - Admin",
            stats: {
                totalProducts: tongSanPham,
                activeProducts: sanPhamDangBan,
                inactiveProducts: sanPhamNgungBan,
                outOfStockCount: soSanPhamHetHang
            },
            recentProducts: sanPhamMoiNhat,
            productsByType: thongKeTheoLoai,
            productsByGender: thongKeTheoGioiTinh
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