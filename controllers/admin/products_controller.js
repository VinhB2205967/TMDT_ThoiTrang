const Product = require('../../models/product_model');
const filterStatusHelper = require('../../helpers/filterStatus');
const searchHelper = require('../../helpers/search');
const paginationHelper = require('../../helpers/pagination');
const productHelper = require('../../helpers/product');

// [GET] /admin/products
const index = async (req, res) => {
    try {
        // Filter Status
        const filterStatus = filterStatusHelper(req.query);

        // Search
        const objectSearch = searchHelper(req.query, { keywordKey: 'keyword' });

        // Pagination
        let objectPagination = {
            currentPage: 1,
            limit: 10
        };

        // Build query
        const find = { daxoa: { $ne: true } };
        if (req.query.trangthai) find.trangthai = req.query.trangthai;
        if (objectSearch.keyword) find.tensanpham = objectSearch.regex;

        // Count & Pagination
        const totalProducts = await Product.countDocuments(find);
        objectPagination = paginationHelper(objectPagination, req.query, totalProducts);

        // Get products
        const products = await Product.find(find)
            .sort({  ngaytao: -1 })
            .skip(objectPagination.skip)
            .limit(objectPagination.limit)
            .lean();

        res.render("admin/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: products.map(productHelper),
            filterStatus,
            keyword: objectSearch.keyword,
            pagination: objectPagination
        });

    } catch (error) {
        console.error('Load products error:', error);
        res.status(500).send('Không tải được danh sách sản phẩm');
    }
};

module.exports = { index };
