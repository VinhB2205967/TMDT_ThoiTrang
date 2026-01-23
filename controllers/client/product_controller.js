// Danh sách
const Products = require("../../models/product_model");
const Reviews = require("../../models/review_model");
const searchHelper = require('../../helpers/search');
const productHelper = require('../../helpers/product');
const productViewHelper = require('../../helpers/productView');

function chuanHoaSanPhamDanhSach(item) {
    const p = productHelper(item);

    // Giữ tương thích với view hiện tại: dùng item.hinhanh
    p.hinhanh = p.displayImage || productViewHelper.normalizeImage(p.hinhanh);

    // Hỗ trợ cả 2 cấu trúc dữ liệu biến thể
    if (p.bienthe && p.bienthe.length > 0) {
        p.bienthe = p.bienthe.map((variant, idx) => ({
            ...variant,
            mausac: variant.mausac || `Màu ${idx + 1}`,
            hinhanh: productViewHelper.normalizeImage(variant.hinhanh),
            colorCode: productViewHelper.getColorCode(variant.mausac)
        }));
    } else if (p.mausac && p.mausac.length > 0) {
        // Chuyển mausac array thành bienthe để view hiển thị được
        p.bienthe = p.mausac.map(color => ({
            mausac: color,
            colorCode: productViewHelper.getColorCode(color),
            hinhanh: null,
            gia: p.gia
        }));
    }

    return p;
}

module.exports.danhSach = async (req, res) => {
    try {
        // Search
        const doiTuongTimKiem = searchHelper(req.query, { keywordKey: 'keyword' });
        
        // Build query
        const boLoc = {
            daxoa: { $ne: true },
            trangthai: 'dangban'
        };
        
        // Tìm kiếm theo từ khóa
        if (doiTuongTimKiem.keyword) {
            boLoc.tensanpham = doiTuongTimKiem.regex;
        }
        
        // Lọc theo loại sản phẩm
        const tapLoaiChoPhep = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
        if (req.query.loaisanpham && tapLoaiChoPhep.has(req.query.loaisanpham)) {
            boLoc.loaisanpham = req.query.loaisanpham;
        }

        // Lọc theo giới tính
        const tapGioiTinhChoPhep = new Set(['nam', 'nu', 'unisex']);
        if (req.query.gioitinh && tapGioiTinhChoPhep.has(req.query.gioitinh)) {
            boLoc.gioitinh = req.query.gioitinh;
        }
        
        // Lọc theo khoảng giá (giá sau giảm)
        if (req.query.priceMin || req.query.priceMax) {
            const giaTu = parseInt(req.query.priceMin) || 0;
            const giaDen = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;
            
            boLoc.$expr = {
                $and: [
                    {
                        $gte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giaTu
                        ]
                    },
                    {
                        $lte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giaDen
                        ]
                    }
                ]
            };
        }
        
        // Sắp xếp (whitelist)
        let sapXep = { ngaytao: -1 };
        if (req.query.sort) {
            const [khoa, huong] = String(req.query.sort).split('-');
            const tapKhoaSapXep = new Set(['gia', 'ngaytao', 'tensanpham']);
            const tapChieuSapXep = new Set(['asc', 'desc']);
            if (tapKhoaSapXep.has(khoa) && tapChieuSapXep.has(huong)) {
                sapXep = { [khoa]: huong === 'asc' ? 1 : -1 };
            }
        }
        
        const danhSachSanPham = await Products.find(boLoc).sort(sapXep).lean();
        const capNhatSP = (danhSachSanPham || []).map(chuanHoaSanPhamDanhSach);

        res.render("client/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: capNhatSP,
            keyword: doiTuongTimKiem.keyword,
            currentSort: req.query.sort,
            currentLoai: req.query.loaisanpham,
            currentGioiTinh: req.query.gioitinh,
            priceMin: req.query.priceMin,
            priceMax: req.query.priceMax
        });
    } catch (error) {
        console.error("Lỗi lấy sản phẩm:", error);
        res.status(500).send("Lỗi server");
    }
};



// Chi tiết
module.exports.chiTiet = async (req, res) => {
    try {
        const idSanPham = req.params.id;
        const sanPham = await Products.findById(idSanPham).lean();
        if (!sanPham) {
            return res.status(404).render('client/pages/products/detail.pug', { titlePage: 'Sản phẩm không tồn tại' });
        }

        const capNhatSP = productHelper(sanPham);
        capNhatSP.hinhanh = capNhatSP.displayImage || productViewHelper.normalizeImage(capNhatSP.hinhanh);

        // Tạo danh sách tất cả các lựa chọn màu
        let tatCaBienThe = [];
        
        // LUÔN thêm sản phẩm chính như biến thể đầu tiên
        const mauChinh = capNhatSP.mausac_chinh || 'Mặc định';
        const sizeChinh = capNhatSP.sizes || [];
        tatCaBienThe.push({
            _id: 'main',
            mausac: mauChinh,
            hinhanh: capNhatSP.hinhanh || '/images/shopping.png',
            colorCode: productViewHelper.getColorCode(mauChinh),
            gia: capNhatSP.gia,
            phantramgiamgia: capNhatSP.phantramgiamgia,
            sizes: sizeChinh,
            soluong: capNhatSP.soluong_chinh || 0,
            isMain: true
        });
        
        // Thêm tất cả các biến thể
        if (capNhatSP.bienthe && capNhatSP.bienthe.length > 0) {
            capNhatSP.bienthe.forEach((bienThe, idx) => {
                const hinhBienThe = productViewHelper.normalizeImage(bienThe.hinhanh);
                const sizeBienThe = bienThe.sizes || [];
                tatCaBienThe.push({
                    ...bienThe,
                    _id: bienThe._id || `variant_${idx}`,
                    mausac: bienThe.mausac || `Màu ${tatCaBienThe.length + 1}`,
                    hinhanh: (hinhBienThe && hinhBienThe !== '/images/shopping.png') ? hinhBienThe : capNhatSP.hinhanh,
                    colorCode: productViewHelper.getColorCode(bienThe.mausac),
                    gia: bienThe.gia || capNhatSP.gia,
                    phantramgiamgia: bienThe.phantramgiamgia || capNhatSP.phantramgiamgia,
                    sizes: sizeBienThe
                });
            });
        } else if (capNhatSP.mausac && capNhatSP.mausac.length > 0) {
            capNhatSP.mausac.forEach(mau => {
                tatCaBienThe.push({
                    mausac: mau,
                    colorCode: productViewHelper.getColorCode(mau),
                    hinhanh: capNhatSP.hinhanh,
                    gia: capNhatSP.gia,
                    sizes: []
                });
            });
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log('Variants count:', tatCaBienThe.length);
        }
        
        // Gán lại biến thể đã được xử lý
        capNhatSP.bienthe = tatCaBienThe;

        // Lấy đánh giá hiển thị
        const danhGia = await Reviews.find({ sanpham_id: idSanPham, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } }).lean();
        let diemTrungBinh = 0;
        if (danhGia && danhGia.length) {
            diemTrungBinh = Math.round((danhGia.reduce((s, r) => s + (r.diem || 0), 0) / danhGia.length) * 10) / 10;
        }

        // Sản phẩm tương tự (cùng loại)
        const sanPhamLienQuan = await Products.find({ loaisanpham: sanPham.loaisanpham, _id: { $ne: sanPham._id }, daxoa: { $ne: true }, trangthai: 'dangban' }).limit(6).lean();
        const sanPhamLienQuanXuLy = (sanPhamLienQuan || []).map(sp => {
            const p = productHelper(sp);
            p.hinhanh = p.displayImage || productViewHelper.normalizeImage(p.hinhanh);
            return p;
        });

        res.render('client/pages/products/detail.pug', {
            titlePage: capNhatSP.tensanpham || 'Chi tiết sản phẩm',
            product: capNhatSP,
            reviews: danhGia || [],
            avgRating: diemTrungBinh,
            related: sanPhamLienQuanXuLy
        });
    } catch (error) {
        console.error('Lỗi lấy chi tiết sản phẩm:', error);
        res.status(500).send('Lỗi server');
    }
};


// Tùy chọn
module.exports.tuyChon = async (req, res) => {
    try {
        const idSanPham = req.params.id;
        const sanPham = await Products.findOne({ _id: idSanPham, daxoa: { $ne: true }, trangthai: 'dangban' }).lean();
        if (!sanPham) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

        const capNhatSP = productHelper(sanPham);
        capNhatSP.hinhanh = capNhatSP.displayImage || productViewHelper.normalizeImage(capNhatSP.hinhanh);

        const khongSize = ['tui', 'phukien'];
        const coSize = !khongSize.includes(String(capNhatSP.loaisanpham || '').toLowerCase());

        const giaGoc = capNhatSP.gia || 0;
        const giamGoc = capNhatSP.phantramgiamgia || 0;
        const giaMoiGoc = giamGoc > 0 ? Math.round(giaGoc * (100 - giamGoc) / 100) : giaGoc;

        const danhSachBienThe = [];

        // Main variant
        danhSachBienThe.push({
            id: 'main',
            mausac: capNhatSP.mausac_chinh || 'Mặc định',
            hinhanh: capNhatSP.hinhanh || '/images/shopping.png',
            gia: giaGoc,
            phantramgiamgia: giamGoc,
            giamoi: giaMoiGoc,
            soluong: capNhatSP.soluong_chinh || 0,
            sizes: Array.isArray(capNhatSP.sizes) ? capNhatSP.sizes.map(s => ({ size: s.size, soluong: s.soluong || 0 })) : []
        });

        // DB variants
        if (capNhatSP.bienthe && capNhatSP.bienthe.length) {
            capNhatSP.bienthe.forEach((bienThe) => {
                const gia = bienThe.gia || giaGoc;
                const giam = bienThe.phantramgiamgia != null ? bienThe.phantramgiamgia : giamGoc;
                const giamoi = giam > 0 ? Math.round(gia * (100 - giam) / 100) : gia;
                danhSachBienThe.push({
                    id: String(bienThe._id),
                    mausac: bienThe.mausac || 'Màu',
                    hinhanh: (productViewHelper.normalizeImage(bienThe.hinhanh) || capNhatSP.hinhanh || '/images/shopping.png'),
                    gia,
                    phantramgiamgia: giam,
                    giamoi,
                    soluong: bienThe.soluong || 0,
                    sizes: Array.isArray(bienThe.sizes) ? bienThe.sizes.map(s => ({ size: s.size, soluong: s.soluong || 0 })) : []
                });
            });
        }

        return res.json({
            success: true,
            product: {
                id: String(capNhatSP._id),
                tensanpham: capNhatSP.tensanpham,
                hinhanh: capNhatSP.hinhanh || '/images/shopping.png',
                gia: giaGoc,
                phantramgiamgia: giamGoc,
                giamoi: giaMoiGoc,
                hasSize: coSize,
                variants: danhSachBienThe
            }
        });
    } catch (error) {
        console.error('options error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};