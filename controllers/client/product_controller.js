//[GET] /products
const Products = require("../../models/product_model");
const Reviews = require("../../models/review_model");
const searchHelper = require('../../helpers/search');

const colorMap = {
    'đỏ': '#e74c3c',
    'do': '#e74c3c',
    'red': '#e74c3c',
    'xanh': '#3498db',
    'xanh dương': '#3498db',
    'blue': '#3498db',
    'xanh lá': '#2ecc71',
    'xanh la': '#2ecc71',
    'green': '#2ecc71',
    'vàng': '#f1c40f',
    'vang': '#f1c40f',
    'yellow': '#f1c40f',
    'đen': '#2c3e50',
    'den': '#2c3e50',
    'black': '#2c3e50',
    'trắng': '#ecf0f1',
    'trang': '#ecf0f1',
    'white': '#ecf0f1',
    'hồng': '#e91e63',
    'hong': '#e91e63',
    'pink': '#e91e63',
    'tím': '#9b59b6',
    'tim': '#9b59b6',
    'purple': '#9b59b6',
    'cam': '#e67e22',
    'orange': '#e67e22',
    'nâu': '#795548',
    'nau': '#795548',
    'brown': '#795548',
    'xám': '#95a5a6',
    'xam': '#95a5a6',
    'gray': '#95a5a6',
    'grey': '#95a5a6',
    'be': '#d4a574',
    'beige': '#d4a574',
    'kem': '#fffdd0',
    'navy': '#1a237e',
    'xanh navy': '#1a237e'
};

function getColorCode(colorName) {
    if (!colorName) return '#ccc';
    const lowerColor = colorName.toLowerCase().trim();
    return colorMap[lowerColor] || colorName; 
}

function normalizeImage(img) {
    if (!img) return '/images/shopping.png';
    if (img.startsWith('/public/')) {
        return img.replace('/public', '');
    }
    if (img.startsWith('http')) return img;
    if (img.startsWith('/')) return img;
    return `/images/${img}`;
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
        if (req.query.loaisanpham) {
            query.loaisanpham = req.query.loaisanpham;
        }
        
        // Lọc theo giới tính
        if (req.query.gioitinh) {
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
        
        // Sắp xếp
        let sort = { ngaytao: -1 };
        if (req.query.sort) {
            const [key, value] = req.query.sort.split('-');
            sort = { [key]: value === 'asc' ? 1 : -1 };
        }
        
        const products = await Products.find(query).sort(sort).lean();

        // Xử lý giảm giá, format giá, chuẩn hóa ảnh
        const newProduct = products.map((item) => {
            const updated = { ...item };

            // Chuẩn hóa ảnh chính
            updated.hinhanh = normalizeImage(updated.hinhanh);

            // Xử lý biến thể - hỗ trợ cả 2 cấu trúc:
            // 1. bienthe: [{mausac, hinhanh, gia}] - cấu trúc mới
            // 2. mausac: ["Đen", "Trắng"] - cấu trúc cũ
            if (updated.bienthe && updated.bienthe.length > 0) {
                updated.bienthe = updated.bienthe.map((variant, idx) => ({
                    ...variant,
                    mausac: variant.mausac || `Màu ${idx + 1}`, // Tự động điền tên màu nếu thiếu
                    hinhanh: normalizeImage(variant.hinhanh),
                    colorCode: getColorCode(variant.mausac),
                    gia: variant.gia || updated.gia,
                    giaText: (variant.gia || updated.gia)?.toLocaleString('vi-VN')
                }));
            } else if (updated.mausac && updated.mausac.length > 0) {
                // Chuyển mausac array thành bienthe để view hiển thị được
                updated.bienthe = updated.mausac.map(color => ({
                    mausac: color,
                    colorCode: getColorCode(color),
                    hinhanh: null,
                    gia: updated.gia
                }));
            }

            // Update giá và giảm giá
            if (updated.gia) {
                if (updated.phantramgiamgia && updated.phantramgiamgia > 0) {
                    updated.giamoi = Math.round(updated.gia - (updated.gia * updated.phantramgiamgia / 100));
                } else {
                    updated.giamoi = updated.gia;
                }
                updated.giaText = updated.gia.toLocaleString('vi-VN');
                updated.giamoiText = updated.giamoi.toLocaleString('vi-VN');
            }

            return updated;
        });

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

        // Chuẩn hóa ảnh và biến thể tương tự như index
        const normalizeImageLocal = normalizeImage;
        const getColorCodeLocal = getColorCode;

        const updated = { ...product };
        updated.hinhanh = normalizeImageLocal(updated.hinhanh);

        // Tạo danh sách tất cả các lựa chọn màu
        let allVariants = [];
        
        // LUÔN thêm sản phẩm chính như biến thể đầu tiên
        const mainColorName = updated.mausac_chinh || 'Mặc định';
        const mainSizes = updated.sizes || [];
        allVariants.push({
            _id: 'main',
            mausac: mainColorName,
            hinhanh: updated.hinhanh || '/images/shopping.png',
            colorCode: getColorCodeLocal(mainColorName),
            gia: updated.gia,
            phantramgiamgia: updated.phantramgiamgia,
            sizes: mainSizes,
            isMain: true
        });
        
        // Thêm tất cả các biến thể
        if (updated.bienthe && updated.bienthe.length > 0) {
            updated.bienthe.forEach((variant, idx) => {
                const variantImage = normalizeImageLocal(variant.hinhanh);
                const variantSizes = variant.sizes || [];
                allVariants.push({
                    ...variant,
                    _id: variant._id || `variant_${idx}`,
                    mausac: variant.mausac || `Màu ${allVariants.length + 1}`,
                    hinhanh: (variantImage && variantImage !== '/images/shopping.png') ? variantImage : updated.hinhanh,
                    colorCode: getColorCodeLocal(variant.mausac),
                    gia: variant.gia || updated.gia,
                    phantramgiamgia: variant.phantramgiamgia || updated.phantramgiamgia,
                    sizes: variantSizes
                });
            });
        } else if (updated.mausac && updated.mausac.length > 0) {
            updated.mausac.forEach(color => {
                allVariants.push({
                    mausac: color,
                    colorCode: getColorCodeLocal(color),
                    hinhanh: updated.hinhanh,
                    gia: updated.gia,
                    sizes: []
                });
            });
        }
        
        // Debug log
        console.log('=== VARIANTS DEBUG ===');
        console.log('Tổng số biến thể sau xử lý:', allVariants.length);
        allVariants.forEach((v, i) => console.log(`Variant ${i}:`, v.mausac, '- Sizes:', v.sizes ? v.sizes.length : 0));
        
        // Gán lại biến thể đã được xử lý
        updated.bienthe = allVariants;

        if (updated.gia) {
            if (updated.phantramgiamgia && updated.phantramgiamgia > 0) {
                updated.giamoi = Math.round(updated.gia - (updated.gia * updated.phantramgiamgia / 100));
            } else {
                updated.giamoi = updated.gia;
            }
            updated.giaText = updated.gia.toLocaleString('vi-VN');
            updated.giamoiText = updated.giamoi.toLocaleString('vi-VN');
        }

        // Lấy đánh giá hiển thị
        const reviews = await Reviews.find({ sanpham_id: id, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } }).lean();
        let avgRating = 0;
        if (reviews && reviews.length) {
            avgRating = Math.round((reviews.reduce((s, r) => s + (r.diem || 0), 0) / reviews.length) * 10) / 10;
        }

        // Sản phẩm tương tự (cùng loại)
        const related = await Products.find({ loaisanpham: product.loaisanpham, _id: { $ne: product._id }, daxoa: { $ne: true }, trangthai: 'dangban' }).limit(6).lean();
        const relatedProcessed = (related || []).map(it => {
            const r = { ...it };
            r.hinhanh = normalizeImageLocal(r.hinhanh);
            if (r.gia) {
                if (r.phantramgiamgia && r.phantramgiamgia > 0) {
                    r.giamoi = Math.round(r.gia - (r.gia * r.phantramgiamgia / 100));
                } else {
                    r.giamoi = r.gia;
                }
                r.giaText = r.gia.toLocaleString('vi-VN');
                r.giamoiText = r.giamoi.toLocaleString('vi-VN');
            }
            return r;
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