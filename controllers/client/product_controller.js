const Products = require("../../models/product_model");
const Reviews = require("../../models/review_model");
const searchHelper = require("../../helpers/search");
const productHelper = require("../../helpers/product.helper");

/* ================================
   [GET] /products
================================ */
module.exports.index = async (req, res) => {
    try {
        const search = searchHelper(req.query, { keywordKey: 'keyword' });

        const query = {
            daxoa: { $ne: true },
            trangthai: 'dangban'
        };

        // Search
        if (search.keyword) {
            query.tensanpham = search.regex;
        }

        // Filter
        if (req.query.loaisanpham) {
            query.loaisanpham = req.query.loaisanpham;
        }

        if (req.query.gioitinh) {
            query.gioitinh = req.query.gioitinh;
        }

        // Price filter (tính trực tiếp từ gia + phantramgiamgia)
        const priceMin = parseInt(req.query.priceMin) || 0;
        const priceMax = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;

        if (req.query.priceMin || req.query.priceMax) {
            query.$expr = {
                $and: [
                    {
                        $gte: [
                            { 
                                $multiply: [
                                    "$gia",
                                    { $divide: [ { $subtract: [100, { $ifNull: ["$phantramgiamgia", 0] }] }, 100 ] }
                                ]
                            },
                            priceMin
                        ]
                    },
                    {
                        $lte: [
                            { 
                                $multiply: [
                                    "$gia",
                                    { $divide: [ { $subtract: [100, { $ifNull: ["$phantramgiamgia", 0] }] }, 100 ] }
                                ]
                            },
                            priceMax
                        ]
                    }
                ]
            };
        }

        // Sort (whitelist)
        const allowedSortFields = ["gia", "tensanpham", "ngaytao"];
        let sort = { ngaytao: -1 };

        if (req.query.sort) {
            const [key, value] = req.query.sort.split("-");
            if (allowedSortFields.includes(key)) {
                sort = { [key]: value === "asc" ? 1 : -1 };
            }
        }

        const products = await Products.find(query).sort(sort).lean();

        const newProducts = products.map(p => productHelper.formatProduct(p));

        res.render("client/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: newProducts,
            keyword: search.keyword,
            currentSort: req.query.sort,
            currentLoai: req.query.loaisanpham,
            currentGioiTinh: req.query.gioitinh,
            priceMin: req.query.priceMin,
            priceMax: req.query.priceMax
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};


/* ================================
   [GET] /products/:id
================================ */
module.exports.show = async (req, res) => {
    try {
        const id = req.params.id;

        const product = await Products.findById(id).lean();
        if (!product || product.daxoa) {
            return res.status(404).render("client/pages/products/detail.pug", {
                titlePage: "Sản phẩm không tồn tại"
            });
        }

        const { normalizeImage, getColorCode } = productHelper;

        const updated = { ...product };
        updated.hinhanh = normalizeImage(updated.hinhanh);

        /* ============================
           1. Tính giá
        ============================ */
        updated.giamoi = Math.round(
            updated.gia * (100 - (updated.phantramgiamgia || 0)) / 100
        );

        updated.giaText = updated.gia.toLocaleString("vi-VN");
        updated.giamoiText = updated.giamoi.toLocaleString("vi-VN");

        /* ============================
           2. Build variants
        ============================ */
        const variants = [];

        // Sản phẩm chính
        variants.push({
            _id: "main",
            mausac: updated.mausac_chinh || "Mặc định",
            hinhanh: updated.hinhanh,
            colorCode: getColorCode(updated.mausac_chinh),
            gia: updated.gia,
            giamoi: updated.giamoi,
            sizes: updated.size || [],
            soluong: updated.soluongton || 0,
            isMain: true
        });

        // Biến thể
        if (Array.isArray(updated.bienthe)) {
            updated.bienthe.forEach((v, i) => {
                const gia = v.gia != null ? v.gia : updated.gia;
                const pt = v.phantramgiamgia != null ? v.phantramgiamgia : updated.phantramgiamgia;
                const giamoi = Math.round(gia * (100 - (pt || 0)) / 100);

                variants.push({
                    _id: v._id || `variant_${i}`,
                    mausac: v.mausac || `Màu ${i + 1}`,
                    hinhanh: normalizeImage(v.hinhanh) || updated.hinhanh,
                    colorCode: getColorCode(v.mausac),
                    gia,
                    giamoi,
                    sizes: v.sizes || [],
                    soluong: v.soluong || 0,
                    isMain: false
                });
            });
        }

        updated.bienthe = variants;

        /* ============================
           3. Reviews
        ============================ */
        const reviews = await Reviews.find({
            sanpham_id: id,
            trangthai: "approved",
            hienthi: true,
            daxoa: { $ne: true }
        }).lean();

        let avgRating = 0;
        if (reviews.length) {
            avgRating = Math.round(
                (reviews.reduce((s, r) => s + (r.diem || 0), 0) / reviews.length) * 10
            ) / 10;
        }

        /* ============================
           4. Related products
        ============================ */
        const related = await Products.find({
            loaisanpham: updated.loaisanpham,
            _id: { $ne: updated._id },
            daxoa: { $ne: true },
            trangthai: "dangban"
        }).limit(6).lean();

        const relatedProcessed = related.map(p => productHelper.formatProduct(p));

        /* ============================
           5. Render
        ============================ */
        res.render("client/pages/products/detail.pug", {
            titlePage: updated.tensanpham,
            product: updated,
            reviews,
            avgRating,
            related: relatedProcessed
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};
