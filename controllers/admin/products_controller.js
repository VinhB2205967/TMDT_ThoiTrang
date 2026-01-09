const Product = require('../../models/product_model');

module.exports.index = async (req, res) => {
    try {
        const products = await Product.find({ daxoa: { $ne: true } })
            .sort({ vitrihienthi: 1, ngaytao: -1 })
            .lean();

        const normalized = products.map((item) => {
            const p = { ...item };

            // Chuẩn hóa ảnh tương tự client, tránh /images/images/... lặp
            if (p.hinhanh && p.hinhanh.startsWith('/public/')) {
                p.hinhanh = p.hinhanh.replace('/public', '');
            }

            if (!p.hinhanh) {
                p.displayImage = '/images/shopping.png';
            } else if (p.hinhanh.startsWith('http')) {
                p.displayImage = p.hinhanh;
            } else if (p.hinhanh.startsWith('/')) {
                p.displayImage = p.hinhanh; // đã có root slash, giữ nguyên
            } else {
                p.displayImage = `/images/${p.hinhanh}`;
            }

            // Giá và giảm giá
            if (p.gia) {
                const hasDiscount = p.phantramgiamgia && p.phantramgiamgia > 0;
                p.giamoi = hasDiscount
                    ? Math.round(p.gia - (p.gia * p.phantramgiamgia / 100))
                    : p.gia;
                p.giaText = p.gia.toLocaleString('vi-VN') + '₫';
                p.giamoiText = p.giamoi.toLocaleString('vi-VN') + '₫';
            }

            return p;
        });

        res.render("admin/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: normalized
        });
    } catch (error) {
        console.error('Load products error:', error);
        res.status(500).send('Không tải được danh sách sản phẩm');
    }
}
