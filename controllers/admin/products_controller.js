const Product = require('../../models/product_model');

/* ============================
   HELPER FUNCTIONS
============================ */

// Chuẩn hóa trạng thái filter
const parseFilterStatus = (status) => {
    const allowed = ['dangban', 'ngungban'];
    return allowed.includes(status) ? status : null;
};

// Chuẩn hóa page
const parsePage = (page) => {
    const p = parseInt(page);
    return isNaN(p) || p < 1 ? 1 : p;
};

// Build query MongoDB
const buildFindQuery = (filterStatus, keyword) => {
    const find = { daxoa: { $ne: true } };

    if (filterStatus === 'dangban') {
        find.trangthai = 'dangban';
    }

    if (filterStatus === 'ngungban') {
        find.trangthai = 'ngungban';
    }

    if (keyword) {
        find.$text = { $search: keyword };
    }

    return find;
};

// Chuẩn hóa ảnh + giá
const normalizeProduct = (item) => {
    const p = { ...item };

    // Xử lý ảnh
    if (p.hinhanh?.startsWith('/public/')) {
        p.hinhanh = p.hinhanh.replace('/public', '');
    }

    if (!p.hinhanh) {
        p.displayImage = '/images/shopping.png';
    } else if (p.hinhanh.startsWith('http') || p.hinhanh.startsWith('/')) {
        p.displayImage = p.hinhanh;
    } else {
        p.displayImage = `/images/${p.hinhanh}`;
    }

    // Xử lý giá
    if (p.gia) {
        const discount = p.phantramgiamgia || 0;
        p.giamoi = Math.round(p.gia * (100 - discount) / 100);
        p.giaText = p.gia.toLocaleString('vi-VN') + '₫';
        p.giamoiText = p.giamoi.toLocaleString('vi-VN') + '₫';
    }

    // Tồn kho
    const variantStock = Array.isArray(p.bienthe) && p.bienthe.length
        ? p.bienthe.reduce((sum, v) => sum + (Number(v?.soluongton) || 0), 0)
        : null;
    const stock = variantStock !== null ? variantStock : (Number(p.soluongton) || 0);
    p.tonkho = stock;
    p.tonkhoText = stock.toLocaleString('vi-VN');

    return p;
};



// [GET] /admin/products
const index = async (req, res) => {
    try {
        const filterStatus = parseFilterStatus(req.query.trangthai);
        const keyword = (req.query.keyword || '').trim();
        const page = parsePage(req.query.page);

        const limit = 10;
        const skip = (page - 1) * limit;

        const find = buildFindQuery(filterStatus, keyword);

        const [totalProducts, products] = await Promise.all([
            Product.countDocuments(find),
            Product.find(find)
                .sort({
                    ...(keyword ? { score: { $meta: "textScore" } } : {}),
                    vitrihienthi: 1,
                    ngaytao: -1
                })
                .skip(skip)
                .limit(limit)
                .lean()
        ]);

        const totalPages = Math.ceil(totalProducts / limit);
        const normalizedProducts = products.map(normalizeProduct);

        res.render("admin/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: normalizedProducts,
            filterStatus: filterStatus || 'all',
            keyword,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                limit
            }
        });

    } catch (error) {
        console.error('Load products error:', error);
        res.status(500).send('Không tải được danh sách sản phẩm');
    }
};

module.exports = {
    index
};
