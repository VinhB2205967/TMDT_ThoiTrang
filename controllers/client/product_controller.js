const Products = require("../../models/product_model");

module.exports.index = async (req, res) => {
    try {
        const products = await Products.find({ daxoa: false }).lean();
        
        // Xử lý giảm giá và format giá
        products.forEach(item => {
            if (item.gia) {
                // Tính giá sau giảm
                if (item.phantramgiamgia && item.phantramgiamgia > 0) {
                    item.giamoi = Math.round(item.gia - (item.gia * item.phantramgiamgia / 100));
                } else {
                    item.giamoi = item.gia;
                }
                
                // Format giá thành chuỗi có dấu phẩy
                item.giaText = item.gia.toLocaleString('vi-VN');
                item.giamoiText = item.giamoi.toLocaleString('vi-VN');
            }
            
            // Xử lý đường dẫn ảnh
            if (item.hinhanh && item.hinhanh.startsWith('/public/')) {
                item.hinhanh = item.hinhanh.replace('/public', '');
            } else if (!item.hinhanh) {
                item.hinhanh = '/images/shopping.png';
            }
        });
        
        res.render("client/pages/products/index.pug", {
            titlePage: "Products Page",
            products: products
        });
    } catch (error) {
        console.error("Lỗi lấy sản phẩm:", error);
        res.status(500).send("Lỗi server");
    }
};

module.exports.edit = (req, res) => {
    res.render("client/pages/products/index.pug");
};