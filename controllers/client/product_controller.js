//[GET] /products
const Products = require("../../models/product_model");

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
        const products = await Products.find({ daxoa: false }).lean();

        // Xử lý giảm giá, format giá, chuẩn hóa ảnh
        const newProduct = products.map((item) => {
            const updated = { ...item };

            // Chuẩn hóa ảnh chính
            updated.hinhanh = normalizeImage(updated.hinhanh);

            // Xử lý biến thể - hỗ trợ cả 2 cấu trúc:
            // 1. bienthe: [{mausac, hinhanh, gia}] - cấu trúc mới
            // 2. mausac: ["Đen", "Trắng"] - cấu trúc cũ
            if (updated.bienthe && updated.bienthe.length > 0) {
                updated.bienthe = updated.bienthe.map(variant => ({
                    ...variant,
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