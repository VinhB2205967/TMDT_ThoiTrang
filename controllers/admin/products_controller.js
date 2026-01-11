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

        // Lấy các filter nâng cao
        const currentSort = req.query.sort || 'ngaytao-desc';
        const priceMin = req.query.priceMin || '';
        const priceMax = req.query.priceMax || '';
        const dateFrom = req.query.dateFrom || '';
        const dateTo = req.query.dateTo || '';

        // Pagination
        let objectPagination = {
            currentPage: 1,
            limit: 10
        };

        // Build query
        const find = { daxoa: { $ne: true } };
        if (req.query.trangthai) find.trangthai = req.query.trangthai;
        if (objectSearch.keyword) find.tensanpham = objectSearch.regex;
        
        // Filter theo giá
        if (priceMin || priceMax) {
            find.gia = {};
            if (priceMin) find.gia.$gte = parseInt(priceMin);
            if (priceMax) find.gia.$lte = parseInt(priceMax);
        }
        
        // Filter theo ngày
        if (dateFrom || dateTo) {
            find.ngaytao = {};
            if (dateFrom) find.ngaytao.$gte = new Date(dateFrom);
            if (dateTo) find.ngaytao.$lte = new Date(dateTo + 'T23:59:59');
        }

        // Count & Pagination
        const totalProducts = await Product.countDocuments(find);
        objectPagination = paginationHelper(objectPagination, req.query, totalProducts);
        
        // Build sort
        let sortConfig = { ngaytao: -1 };
        if (currentSort) {
            const [field, order] = currentSort.split('-');
            sortConfig = { [field]: order === 'asc' ? 1 : -1 };
        }

        // Get products
        const products = await Product.find(find)
            .sort(sortConfig)
            .skip(objectPagination.skip)
            .limit(objectPagination.limit)
            .lean();

        res.render("admin/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: products.map(productHelper),
            filterStatus,
            keyword: objectSearch.keyword,
            pagination: objectPagination,
            currentSort,
            priceMin,
            priceMax,
            dateFrom,
            dateTo
        });

    } catch (error) {
        console.error('Load products error:', error);
        res.status(500).send('Không tải được danh sách sản phẩm');
    }
};

module.exports = { index };
