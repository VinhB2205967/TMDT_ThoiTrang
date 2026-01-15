//[GET] /products
const Products = require("../../models/product_model");
const Reviews = require("../../models/review_model");
const searchHelper = require('../../helpers/search');
const productHelper = require('../../helpers/product');
const productViewHelper = require('../../helpers/productView');

function normalizeProductForList(item) {
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

module.exports.index = async (req, res) => {
    try {
        // Search
        const objectSearch = searchHelper(req.query, { keywordKey: 'keyword' });
        
        // Build query
        const query = {
            daxoa: { $ne: true },
            trangthai: 'dangban'
        };
        
        // Tìm kiếm theo từ khóa
        if (objectSearch.keyword) {
            query.tensanpham = objectSearch.regex;
        }
        
        // Lọc theo loại sản phẩm
        const allowedLoai = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
        if (req.query.loaisanpham && allowedLoai.has(req.query.loaisanpham)) {
            query.loaisanpham = req.query.loaisanpham;
        }

        // Lọc theo giới tính
        const allowedGioiTinh = new Set(['nam', 'nu', 'unisex']);
        if (req.query.gioitinh && allowedGioiTinh.has(req.query.gioitinh)) {
            query.gioitinh = req.query.gioitinh;
        }
        
        // Lọc theo khoảng giá (giá sau giảm)
        if (req.query.priceMin || req.query.priceMax) {
            const priceMin = parseInt(req.query.priceMin) || 0;
            const priceMax = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;
            
            query.$expr = {
                $and: [
                    {
                        $gte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            priceMin
                        ]
                    },
                    {
                        $lte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            priceMax
                        ]
                    }
                ]
            };
        }
        
        // Sắp xếp (whitelist)
        let sort = { ngaytao: -1 };
        if (req.query.sort) {
            const [key, value] = String(req.query.sort).split('-');
            const allowedSortKeys = new Set(['gia', 'ngaytao', 'tensanpham']);
            const allowedSortDir = new Set(['asc', 'desc']);
            if (allowedSortKeys.has(key) && allowedSortDir.has(value)) {
                sort = { [key]: value === 'asc' ? 1 : -1 };
            }
        }
        
        const products = await Products.find(query).sort(sort).lean();
        const newProduct = (products || []).map(normalizeProductForList);

        res.render("client/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: newProduct,
            keyword: objectSearch.keyword,
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



module.exports.show = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Products.findById(id).lean();
        if (!product) {
            return res.status(404).render('client/pages/products/detail.pug', { titlePage: 'Sản phẩm không tồn tại' });
        }

        const updated = productHelper(product);
        updated.hinhanh = updated.displayImage || productViewHelper.normalizeImage(updated.hinhanh);

        // Tạo danh sách tất cả các lựa chọn màu
        let allVariants = [];
        
        // LUÔN thêm sản phẩm chính như biến thể đầu tiên
        const mainColorName = updated.mausac_chinh || 'Mặc định';
        const mainSizes = updated.sizes || [];
        allVariants.push({
            _id: 'main',
            mausac: mainColorName,
            hinhanh: updated.hinhanh || '/images/shopping.png',
            colorCode: productViewHelper.getColorCode(mainColorName),
            gia: updated.gia,
            phantramgiamgia: updated.phantramgiamgia,
            sizes: mainSizes,
            soluong: updated.soluong_chinh || 0,
            isMain: true
        });
        
        // Thêm tất cả các biến thể
        if (updated.bienthe && updated.bienthe.length > 0) {
            updated.bienthe.forEach((variant, idx) => {
                const variantImage = productViewHelper.normalizeImage(variant.hinhanh);
                const variantSizes = variant.sizes || [];
                allVariants.push({
                    ...variant,
                    _id: variant._id || `variant_${idx}`,
                    mausac: variant.mausac || `Màu ${allVariants.length + 1}`,
                    hinhanh: (variantImage && variantImage !== '/images/shopping.png') ? variantImage : updated.hinhanh,
                    colorCode: productViewHelper.getColorCode(variant.mausac),
                    gia: variant.gia || updated.gia,
                    phantramgiamgia: variant.phantramgiamgia || updated.phantramgiamgia,
                    sizes: variantSizes
                });
            });
        } else if (updated.mausac && updated.mausac.length > 0) {
            updated.mausac.forEach(color => {
                allVariants.push({
                    mausac: color,
                    colorCode: productViewHelper.getColorCode(color),
                    hinhanh: updated.hinhanh,
                    gia: updated.gia,
                    sizes: []
                });
            });
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log('Variants count:', allVariants.length);
        }
        
        // Gán lại biến thể đã được xử lý
        updated.bienthe = allVariants;

        // Lấy đánh giá hiển thị
        const reviews = await Reviews.find({ sanpham_id: id, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } }).lean();
        let avgRating = 0;
        if (reviews && reviews.length) {
            avgRating = Math.round((reviews.reduce((s, r) => s + (r.diem || 0), 0) / reviews.length) * 10) / 10;
        }

        // Sản phẩm tương tự (cùng loại)
        const related = await Products.find({ loaisanpham: product.loaisanpham, _id: { $ne: product._id }, daxoa: { $ne: true }, trangthai: 'dangban' }).limit(6).lean();
        const relatedProcessed = (related || []).map(r => {
            const p = productHelper(r);
            p.hinhanh = p.displayImage || productViewHelper.normalizeImage(p.hinhanh);
            return p;
        });

        res.render('client/pages/products/detail.pug', {
            titlePage: updated.tensanpham || 'Chi tiết sản phẩm',
            product: updated,
            reviews: reviews || [],
            avgRating,
            related: relatedProcessed
        });
    } catch (error) {
        console.error('Lỗi lấy chi tiết sản phẩm:', error);
        res.status(500).send('Lỗi server');
    }
};