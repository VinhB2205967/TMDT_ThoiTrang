// Danh sách
const sanpham = require("../../models/product_model");
const danhgia = require("../../models/review_model");
const searchHelper = require('../../helpers/search');
const productHelper = require('../../helpers/product');
const productViewHelper = require('../../helpers/productView');

function chuanHoaSanPhamDanhSach(item) {
    const p = productHelper(item);

    // Giữ tương thích với view hiện tại: dùng item.hinhanh
    p.hinhanh = p.displayImage || productViewHelper.chuanHoaAnh(p.hinhanh);

    // Hỗ trợ cả 2 cấu trúc dữ liệu biến thể
    if (p.bienthe && p.bienthe.length > 0) {
        p.bienthe = p.bienthe.map((variant, idx) => ({
            ...variant,
            mausac: variant.mausac || `Màu ${idx + 1}`,
            hinhanh: productViewHelper.chuanHoaAnh(variant.hinhanh),
            colorCode: productViewHelper.layMaMau(variant.mausac)
        }));
    } else if (p.mausac && p.mausac.length > 0) {
        // Chuyển mausac array thành bienthe để view hiển thị được
        p.bienthe = p.mausac.map(color => ({
            mausac: color,
            colorCode: productViewHelper.layMaMau(color),
            hinhanh: null,
            gia: p.gia
        }));
    }

    return p;
}

module.exports.danhSach = async (req, res) => {
    try {
        // Search
        const doituongtimkiem = searchHelper(req.query, { keywordKey: 'keyword' });
        
        // Build query
        const boloc = {
            daxoa: { $ne: true },
            trangthai: 'dangban'
        };
        
        // Tìm kiếm theo từ khóa
        if (doituongtimkiem.keyword) {
            boloc.tensanpham = doituongtimkiem.regex;
        }
        
        // Lọc theo loại sản phẩm
        const taploaichophep = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
        if (req.query.loaisanpham && taploaichophep.has(req.query.loaisanpham)) {
            boloc.loaisanpham = req.query.loaisanpham;
        }

        // Lọc theo giới tính
        const tapgioitinhchophep = new Set(['nam', 'nu', 'unisex']);
        if (req.query.gioitinh && tapgioitinhchophep.has(req.query.gioitinh)) {
            boloc.gioitinh = req.query.gioitinh;
        }
        
        // Lọc theo khoảng giá (giá sau giảm)
        if (req.query.priceMin || req.query.priceMax) {
            const giatu = parseInt(req.query.priceMin) || 0;
            const giaden = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;
            
            boloc.$expr = {
                $and: [
                    {
                        $gte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giatu
                        ]
                    },
                    {
                        $lte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giaden
                        ]
                    }
                ]
            };
        }
        
        // Sắp xếp (whitelist)
        let sapxep = { ngaytao: -1 };
        if (req.query.sort) {
            const [khoa, huong] = String(req.query.sort).split('-');
            const tapkhoasapxep = new Set(['gia', 'ngaytao', 'tensanpham']);
            const tapchieusapxep = new Set(['asc', 'desc']);
            if (tapkhoasapxep.has(khoa) && tapchieusapxep.has(huong)) {
                sapxep = { [khoa]: huong === 'asc' ? 1 : -1 };
            }
        }
        
        const danhsachsanpham = await sanpham.find(boloc).sort(sapxep).lean();
        const capnhatsp = (danhsachsanpham || []).map(chuanHoaSanPhamDanhSach);

        res.render("client/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: capnhatsp,
            keyword: doituongtimkiem.keyword,
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
        const idsanpham = req.params.id;
        const sanphamdoc = await sanpham.findById(idsanpham).lean();
        if (!sanphamdoc) {
            return res.status(404).render('client/pages/products/detail.pug', { titlePage: 'Sản phẩm không tồn tại' });
        }

        const capnhatsp = productHelper(sanphamdoc);
        capnhatsp.hinhanh = capnhatsp.displayImage || productViewHelper.chuanHoaAnh(capnhatsp.hinhanh);

        // Tạo danh sách tất cả các lựa chọn màu
        let tatcabienthe = [];
        
        // LUÔN thêm sản phẩm chính như biến thể đầu tiên
        const mauchinh = capnhatsp.mausac_chinh || 'Mặc định';
        const sizechinh = capnhatsp.sizes || [];
        tatcabienthe.push({
            _id: 'main',
            mausac: mauchinh,
            hinhanh: capnhatsp.hinhanh || '/images/shopping.png',
            colorCode: productViewHelper.layMaMau(mauchinh),
            gia: capnhatsp.gia,
            phantramgiamgia: capnhatsp.phantramgiamgia,
            sizes: sizechinh,
            soluong: capnhatsp.soluong_chinh || 0,
            isMain: true
        });
        
        // Thêm tất cả các biến thể
        if (capnhatsp.bienthe && capnhatsp.bienthe.length > 0) {
            capnhatsp.bienthe.forEach((bienthe, idx) => {
                const hinhbienthe = productViewHelper.chuanHoaAnh(bienthe.hinhanh);
                const sizebienthe = bienthe.sizes || [];
                tatcabienthe.push({
                    ...bienthe,
                    _id: bienthe._id || `variant_${idx}`,
                    mausac: bienthe.mausac || `Màu ${tatcabienthe.length + 1}`,
                    hinhanh: (hinhbienthe && hinhbienthe !== '/images/shopping.png') ? hinhbienthe : capnhatsp.hinhanh,
                    colorCode: productViewHelper.layMaMau(bienthe.mausac),
                    gia: bienthe.gia || capnhatsp.gia,
                    phantramgiamgia: bienthe.phantramgiamgia || capnhatsp.phantramgiamgia,
                    sizes: sizebienthe
                });
            });
        } else if (capnhatsp.mausac && capnhatsp.mausac.length > 0) {
            capnhatsp.mausac.forEach(mau => {
                tatcabienthe.push({
                    mausac: mau,
                    colorCode: productViewHelper.layMaMau(mau),
                    hinhanh: capnhatsp.hinhanh,
                    gia: capnhatsp.gia,
                    sizes: []
                });
            });
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log('Variants count:', tatcabienthe.length);
        }
        
        // Gán lại biến thể đã được xử lý
        capnhatsp.bienthe = tatcabienthe;

        // Lấy đánh giá hiển thị
        const danhsachdanhgia = await danhgia.find({ sanpham_id: idsanpham, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } }).lean();
        let diemtrungbinh = 0;
        if (danhsachdanhgia && danhsachdanhgia.length) {
            diemtrungbinh = Math.round((danhsachdanhgia.reduce((s, r) => s + (r.diem || 0), 0) / danhsachdanhgia.length) * 10) / 10;
        }

        // Sản phẩm tương tự (cùng loại)
        const sanphamlienquan = await sanpham.find({ loaisanpham: sanphamdoc.loaisanpham, _id: { $ne: sanphamdoc._id }, daxoa: { $ne: true }, trangthai: 'dangban' }).limit(6).lean();
        const sanphamlienquanxuly = (sanphamlienquan || []).map(sp => {
            const p = productHelper(sp);
            p.hinhanh = p.displayImage || productViewHelper.chuanHoaAnh(p.hinhanh);
            return p;
        });

        res.render('client/pages/products/detail.pug', {
            titlePage: capnhatsp.tensanpham || 'Chi tiết sản phẩm',
            product: capnhatsp,
            reviews: danhsachdanhgia || [],
            avgRating: diemtrungbinh,
            related: sanphamlienquanxuly
        });
    } catch (error) {
        console.error('Lỗi lấy chi tiết sản phẩm:', error);
        res.status(500).send('Lỗi server');
    }
};


// Tùy chọn
module.exports.tuyChon = async (req, res) => {
    try {
        const idsanpham = req.params.id;
        const sanphamdoc = await sanpham.findOne({ _id: idsanpham, daxoa: { $ne: true }, trangthai: 'dangban' }).lean();
        if (!sanphamdoc) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

        const capnhatsp = productHelper(sanphamdoc);
        capnhatsp.hinhanh = capnhatsp.displayImage || productViewHelper.chuanHoaAnh(capnhatsp.hinhanh);

        const khongsize = ['tui', 'phukien'];
        const cosize = !khongsize.includes(String(capnhatsp.loaisanpham || '').toLowerCase());

        const giagoc = capnhatsp.gia || 0;
        const giamgoc = capnhatsp.phantramgiamgia || 0;
        const giamoigoc = giamgoc > 0 ? Math.round(giagoc * (100 - giamgoc) / 100) : giagoc;

        const danhsachbienthe = [];

        // Main variant
        danhsachbienthe.push({
            id: 'main',
            mausac: capnhatsp.mausac_chinh || 'Mặc định',
            hinhanh: capnhatsp.hinhanh || '/images/shopping.png',
            gia: giagoc,
            phantramgiamgia: giamgoc,
            giamoi: giamoigoc,
            soluong: capnhatsp.soluong_chinh || 0,
            sizes: Array.isArray(capnhatsp.sizes) ? capnhatsp.sizes.map(s => ({ size: s.size, soluong: s.soluong || 0 })) : []
        });

        // DB variants
        if (capnhatsp.bienthe && capnhatsp.bienthe.length) {
            capnhatsp.bienthe.forEach((bienthe) => {
                const gia = bienthe.gia || giagoc;
                const giam = bienthe.phantramgiamgia != null ? bienthe.phantramgiamgia : giamgoc;
                const giamoi = giam > 0 ? Math.round(gia * (100 - giam) / 100) : gia;
                danhsachbienthe.push({
                    id: String(bienthe._id),
                    mausac: bienthe.mausac || 'Màu',
                    hinhanh: (productViewHelper.chuanHoaAnh(bienthe.hinhanh) || capnhatsp.hinhanh || '/images/shopping.png'),
                    gia,
                    phantramgiamgia: giam,
                    giamoi,
                    soluong: bienthe.soluong || 0,
                    sizes: Array.isArray(bienthe.sizes) ? bienthe.sizes.map(s => ({ size: s.size, soluong: s.soluong || 0 })) : []
                });
            });
        }

        return res.json({
            success: true,
            product: {
                id: String(capnhatsp._id),
                tensanpham: capnhatsp.tensanpham,
                hinhanh: capnhatsp.hinhanh || '/images/shopping.png',
                gia: giagoc,
                phantramgiamgia: giamgoc,
                giamoi: giamoigoc,
                hasSize: cosize,
                variants: danhsachbienthe
            }
        });
    } catch (error) {
        console.error('options error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};