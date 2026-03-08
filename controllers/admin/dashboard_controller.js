const sanpham = require('../../models/product_model');
const PhieuXuatKho = require('../../models/export_receipt_model');

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

        const exportAgg = await PhieuXuatKho.aggregate([
            {
                $group: {
                    _id: null,
                    tongDoanhThu: { $sum: '$tongdoanhthu' },
                    tongGiaVon: { $sum: '$tonggiavon' },
                    tongLoiNhuan: { $sum: '$tongloinhuan' },
                    tongSanPhamDaBan: { $sum: '$tongsoluong' },
                    tongPhieuXuat: { $sum: 1 }
                }
            }
        ]);

        const exportStats = exportAgg && exportAgg.length ? exportAgg[0] : {
            tongDoanhThu: 0,
            tongGiaVon: 0,
            tongLoiNhuan: 0,
            tongSanPhamDaBan: 0,
            tongPhieuXuat: 0
        };
        const tySuatLoiNhuan = Number(exportStats.tongDoanhThu || 0) > 0
            ? (Number(exportStats.tongLoiNhuan || 0) / Number(exportStats.tongDoanhThu || 0)) * 100
            : 0;

        console.log('Dashboard stats:', { tongsanpham, sanphamdangban, sanphamngungban, sosanphamhethang });
        // Hiển thị trang dashboard với dữ liệu thống kê
        res.render("admin/pages/dashboard/index.pug", {
            titlePage: "Dashboard - Admin",
            stats: {
                totalProducts: tongsanpham,
                activeProducts: sanphamdangban,
                inactiveProducts: sanphamngungban,
                outOfStockCount: sosanphamhethang,
                totalRevenue: Number(exportStats.tongDoanhThu || 0),
                totalCOGS: Number(exportStats.tongGiaVon || 0),
                totalProfit: Number(exportStats.tongLoiNhuan || 0),
                totalSoldItems: Number(exportStats.tongSanPhamDaBan || 0),
                totalExportOrders: Number(exportStats.tongPhieuXuat || 0),
                profitMarginPct: Number(tySuatLoiNhuan.toFixed(2))
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
                outOfStockCount: 0,
                totalRevenue: 0,
                totalCOGS: 0,
                totalProfit: 0,
                totalSoldItems: 0,
                totalExportOrders: 0,
                profitMarginPct: 0
            },
            recentProducts: [],
            productsByType: [],
            productsByGender: []
        });
    }
}