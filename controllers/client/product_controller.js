const Products = require("../../models/product_model");

module.exports.index = async (req, res) => {
    try {
        const products = await Products.find({ daxoa: false }).lean();

        // Xử lý giảm giá, format giá, chuẩn hóa ảnh
        const newProduct = products.map((item) => {
            const updated = { ...item };

            // Chuẩn hóa ảnh
            if (updated.hinhanh && updated.hinhanh.startsWith('/public/')) {
                updated.hinhanh = updated.hinhanh.replace('/public', '');
            }
            if (!updated.hinhanh) {
                updated.hinhanh = '/images/shopping.png';
            }

            // uodate giá và giảm giá
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
            titlePage: "Products Page",
            products: newProduct
        });
    } catch (error) {
        console.error("Lỗi lấy sản phẩm:", error);
        res.status(500).send("Lỗi server");
    }
};

module.exports.edit = (req, res) => {
    res.render("client/pages/products/index.pug");
};