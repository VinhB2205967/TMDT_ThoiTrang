// Danh sách
const sanpham = require("../../models/product_model");
const mongoose = require('mongoose');
const danhgia = require("../../models/review_model");
const searchHelper = require('../../helpers/search');
const productHelper = require('../../helpers/product');
const productViewHelper = require('../../helpers/productView');
const { buildProductStats, applyProductStats } = require('../../helpers/productStats');
const Brand = require('../../models/brand_model');
const Danhmuc = require('../../models/category_model');
const { getCategoryTree, flattenTreeOptions, getDescendantCategoryIds } = require('../../services/category.service');

async function timHoacTaoDanhMuc({ name, slug, type, parentId = null, order = 0 }) {
    const existed = await Danhmuc.findOne({ slug, daxoa: { $ne: true } }).select('_id').lean();
    if (existed?._id) return existed._id;

    const doc = await Danhmuc.create({
        name,
        tendanhmuc: name,
        slug,
        type,
        parent_id: parentId,
        danhmuccha: parentId,
        order,
        thutu: order,
        isActive: true,
        trangthai: 'active',
        daxoa: false
    });
    return doc._id;
}

async function damBaoDanhMucMacDinh() {
    const occasionCount = await Danhmuc.countDocuments({ daxoa: { $ne: true }, type: 'occasion' });
    if (!occasionCount) {
        const rootId = await timHoacTaoDanhMuc({ name: 'Dịp sử dụng', slug: 'taxonomy-occasion-root', type: 'occasion', order: 0 });
        const items = [
            { name: 'Đi làm', slug: 'occasion-di-lam' },
            { name: 'Đi chơi', slug: 'occasion-di-choi' },
            { name: 'Dự tiệc', slug: 'occasion-du-tiec' },
            { name: 'Thể thao', slug: 'occasion-the-thao' },
            { name: 'Ở nhà', slug: 'occasion-o-nha' }
        ];
        for (let index = 0; index < items.length; index += 1) {
            await timHoacTaoDanhMuc({
                name: items[index].name,
                slug: items[index].slug,
                type: 'occasion',
                parentId: rootId,
                order: index + 1
            });
        }
    }

    const ageCount = await Danhmuc.countDocuments({ daxoa: { $ne: true }, type: 'age_group' });
    if (!ageCount) {
        const rootId = await timHoacTaoDanhMuc({ name: 'Nhóm tuổi', slug: 'taxonomy-age-group-root', type: 'age_group', order: 0 });
        const items = [
            { name: '1-3 tuổi', slug: 'age-group-1-3' },
            { name: '4-6 tuổi', slug: 'age-group-4-6' },
            { name: '7-10 tuổi', slug: 'age-group-7-10' },
            { name: '11-14 tuổi', slug: 'age-group-11-14' }
        ];
        for (let index = 0; index < items.length; index += 1) {
            await timHoacTaoDanhMuc({
                name: items[index].name,
                slug: items[index].slug,
                type: 'age_group',
                parentId: rootId,
                order: index + 1
            });
        }
    }
}

async function layBoLocNangCao() {
    let [categoryTree, occasionTree, ageGroupTree, brands] = await Promise.all([
        getCategoryTree({ type: 'category', isActive: true }),
        getCategoryTree({ type: 'occasion', isActive: true }),
        getCategoryTree({ type: 'age_group', isActive: true }),
        Brand.find({ hienthi: true }).sort({ thuTu: 1, ten: 1 }).lean()
    ]);

    if (!flattenTreeOptions(occasionTree).length || !flattenTreeOptions(ageGroupTree).length) {
        await damBaoDanhMucMacDinh();
        [occasionTree, ageGroupTree] = await Promise.all([
            getCategoryTree({ type: 'occasion', isActive: true }),
            getCategoryTree({ type: 'age_group', isActive: true })
        ]);
    }

    return {
        categoryOptions: flattenTreeOptions(categoryTree),
        occasionOptions: flattenTreeOptions(occasionTree),
        ageGroupOptions: flattenTreeOptions(ageGroupTree),
        brandOptions: brands || []
    };
}

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
        const filterOptions = await layBoLocNangCao();
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
        const tapgioitinhchophep = new Set(['nam', 'nu', 'unisex', 'tre-em']);
        if (req.query.gioitinh && tapgioitinhchophep.has(req.query.gioitinh)) {
            boloc.gioitinh = req.query.gioitinh;
        }

        // Lọc theo thương hiệu
        if (req.query.brand && mongoose.Types.ObjectId.isValid(req.query.brand)) {
            boloc.$or = [
                { thuonghieu_id: req.query.brand },
                { brand: req.query.brand }
            ];
        }

        // Lọc theo danh mục cây (bao gồm toàn bộ danh mục con)
        if (req.query.category && mongoose.Types.ObjectId.isValid(req.query.category)) {
            const categoryIds = await getDescendantCategoryIds(req.query.category, {
                includeSelf: true,
                onlyActive: true
            });
            if (categoryIds.length) {
                boloc.category = { $in: categoryIds };
            }
        }

        // Lọc theo dịp
        if (req.query.occasion && mongoose.Types.ObjectId.isValid(req.query.occasion)) {
            boloc.occasion = req.query.occasion;
        }

        // Lọc theo nhóm tuổi
        if (req.query.ageGroup && mongoose.Types.ObjectId.isValid(req.query.ageGroup)) {
            boloc.ageGroup = req.query.ageGroup;
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
        const ids = (danhsachsanpham || []).map(p => p && p._id).filter(Boolean);
        const { ratingMap, soldMap } = await buildProductStats(ids);
        const capnhatspDayDu = applyProductStats(capnhatsp, ratingMap, soldMap);

        res.render("client/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: capnhatspDayDu,
            keyword: doituongtimkiem.keyword,
            currentSort: req.query.sort,
            currentLoai: req.query.loaisanpham,
            currentGioiTinh: req.query.gioitinh,
            currentCategory: req.query.category,
            currentBrand: req.query.brand,
            currentOccasion: req.query.occasion,
            currentAgeGroup: req.query.ageGroup,
            priceMin: req.query.priceMin,
            priceMax: req.query.priceMax,
            ...filterOptions
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

        // Lấy đánh giá hiển thị + filter/sort
        const reviewBase = { sanpham_id: idsanpham, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } };
        const allReviews = await danhgia.find(reviewBase).lean();

        let diemtrungbinh = 0;
        const thongkeSao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        if (allReviews && allReviews.length) {
            const sum = allReviews.reduce((s, r) => {
                const d = Number(r.diem || 0);
                if (thongkeSao[d] != null) thongkeSao[d] += 1;
                return s + d;
            }, 0);
            diemtrungbinh = Math.round((sum / allReviews.length) * 10) / 10;
        }

        const ratingFilter = Number(req.query.rating || 0);
        const hasImage = String(req.query.hasImage || '') === '1';
        const sort = String(req.query.sort || 'newest');

        let filtered = allReviews || [];
        if (ratingFilter >= 1 && ratingFilter <= 5) {
            filtered = filtered.filter(r => Number(r.diem || 0) === ratingFilter);
        }
        if (hasImage) {
            filtered = filtered.filter(r => Array.isArray(r.hinhanh) && r.hinhanh.length);
        }

        if (sort === 'highest') filtered = filtered.sort((a, b) => (b.diem || 0) - (a.diem || 0));
        else if (sort === 'lowest') filtered = filtered.sort((a, b) => (a.diem || 0) - (b.diem || 0));
        else if (sort === 'helpful') filtered = filtered.sort((a, b) => (b.thich || 0) - (a.thich || 0));
        else filtered = filtered.sort((a, b) => new Date(b.ngaytao || 0) - new Date(a.ngaytao || 0));

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
            reviews: filtered || [],
            avgRating: diemtrungbinh,
            reviewStats: {
                total: (allReviews || []).length,
                byStar: thongkeSao
            },
            reviewFilters: {
                rating: ratingFilter || '',
                hasImage: hasImage ? '1' : '',
                sort
            },
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