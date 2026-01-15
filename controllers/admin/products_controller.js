const Product = require('../../models/product_model');
const mongoose = require('mongoose');
const filterStatusHelper = require('../../helpers/filterStatus');
const searchHelper = require('../../helpers/search');
const paginationHelper = require('../../helpers/pagination');
const productHelper = require('../../helpers/product');

const NO_SIZE_TYPES = ['tui', 'phukien'];
const SIZE_LIST = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function isNoSizeProductType(loaisanpham) {
    return NO_SIZE_TYPES.includes(loaisanpham);
}

function buildBaseSizes(reqBody, isNoSizeProduct) {
    const baseSizes = [];
    let tongSizeGoc = 0;
    let soluong_chinh = 0;

    if (isNoSizeProduct) {
        soluong_chinh = parseInt(reqBody.soluong_chinh) || 0;
        tongSizeGoc = soluong_chinh;
        return { baseSizes, tongSizeGoc, soluong_chinh };
    }

    SIZE_LIST.forEach(size => {
        const qty = parseInt(reqBody[`size_${size}`]) || 0;
        if (qty > 0) {
            baseSizes.push({ size: size, soluong: qty });
            tongSizeGoc += qty;
        }
    });

    return { baseSizes, tongSizeGoc, soluong_chinh };
}

function buildVariantsFromRequest({ reqBody, reqFiles, isNoSizeProduct, oldImageArr = [], hasNewImageArr = [] }) {
    if (!reqBody.bienthe_mausac) {
        return { variants: [], tongBienThe: 0 };
    }

    const mausacArr = Array.isArray(reqBody.bienthe_mausac) ? reqBody.bienthe_mausac : [reqBody.bienthe_mausac];
    const giaArr = Array.isArray(reqBody.bienthe_gia) ? reqBody.bienthe_gia : [reqBody.bienthe_gia];
    const giamgiaArr = Array.isArray(reqBody.bienthe_giamgia) ? reqBody.bienthe_giamgia : [reqBody.bienthe_giamgia];
    const soluongArr = Array.isArray(reqBody.bienthe_soluong) ? reqBody.bienthe_soluong : [reqBody.bienthe_soluong];

    const bientheImages = reqFiles && reqFiles['bienthe_hinhanh'] ? reqFiles['bienthe_hinhanh'] : [];
    let imageIndex = 0;
    let tongBienThe = 0;

    const variants = mausacArr.map((mausac, i) => {
        let hinhanh = oldImageArr[i] || null;

        if (hasNewImageArr[i] === '1' && bientheImages[imageIndex]) {
            hinhanh = '/uploads/products/' + bientheImages[imageIndex].filename;
            imageIndex++;
        }

        let variantQty = 0;
        const variantSizes = [];

        if (isNoSizeProduct) {
            variantQty = parseInt(soluongArr[i]) || 0;
            tongBienThe += variantQty;
        } else {
            SIZE_LIST.forEach(size => {
                const qty = parseInt(reqBody[`bienthe_${i}_size_${size}`]) || 0;
                if (qty > 0) {
                    variantSizes.push({ size: size, soluong: qty });
                    tongBienThe += qty;
                }
            });
        }

        return {
            mausac: mausac,
            gia: parseInt(giaArr[i]) || null,
            phantramgiamgia: parseInt(giamgiaArr[i]) || 0,
            hinhanh: hinhanh,
            soluong: variantQty,
            sizes: variantSizes
        };
    }).filter(bt => bt.mausac && bt.mausac.trim() !== '');

    return { variants, tongBienThe };
}

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
        const deleted = String(req.query.deleted || '').trim();
        const find =
            deleted === '1' ? { daxoa: true }
                : deleted === 'all' ? {}
                    : { daxoa: { $ne: true } };
        
        // Lọc theo trạng thái
        if (req.query.trangthai === 'dahet') {
            // Đã hết: soluongton = 0 hoặc không có
            find.soluongton = { $lte: 0 };
        } else if (req.query.trangthai) {
            find.trangthai = req.query.trangthai;
        }
        
        if (objectSearch.keyword) find.tensanpham = objectSearch.regex;

        // Lọc theo giá (giá đã giảm = gia * (100 - phantramgiamgia) / 100)
        if (req.query.priceMin || req.query.priceMax) {
            const priceMin = parseInt(req.query.priceMin) || 0;
            const priceMax = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;
            
            // Sử dụng $expr để tính giá sau giảm
            find.$expr = {
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

        // Lọc theo loại sản phẩm
        const allowedLoai = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
        if (req.query.loaisanpham && allowedLoai.has(req.query.loaisanpham)) {
            find.loaisanpham = req.query.loaisanpham;
        }

        // Lọc theo giới tính
        const allowedGioiTinh = new Set(['nam', 'nu', 'unisex']);
        if (req.query.gioitinh && allowedGioiTinh.has(req.query.gioitinh)) {
            find.gioitinh = req.query.gioitinh;
        }

        // Lọc theo ngày tạo
        if (req.query.dateFrom || req.query.dateTo) {
            find.ngaytao = {};
            if (req.query.dateFrom) find.ngaytao.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) {
                const endDate = new Date(req.query.dateTo);
                endDate.setHours(23, 59, 59, 999);
                find.ngaytao.$lte = endDate;
            }
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

        // Count & Pagination
        const totalProducts = await Product.countDocuments(find);
        objectPagination = paginationHelper(objectPagination, req.query, totalProducts);

        // Get products
        const products = await Product.find(find)
            .sort(sort)
            .skip(objectPagination.skip)
            .limit(objectPagination.limit)
            .lean();

        let filterString = '';
        if (req.query.sort) filterString += `&sort=${req.query.sort}`;
        if (req.query.loaisanpham) filterString += `&loaisanpham=${req.query.loaisanpham}`;
        if (req.query.gioitinh) filterString += `&gioitinh=${req.query.gioitinh}`;
        if (req.query.priceMin) filterString += `&priceMin=${req.query.priceMin}`;
        if (req.query.priceMax) filterString += `&priceMax=${req.query.priceMax}`;
        if (req.query.dateFrom) filterString += `&dateFrom=${req.query.dateFrom}`;
        if (req.query.dateTo) filterString += `&dateTo=${req.query.dateTo}`;
        if (req.query.deleted) filterString += `&deleted=${req.query.deleted}`;

        res.render("admin/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: products.map(productHelper),
            filterStatus,
            keyword: objectSearch.keyword,
            pagination: objectPagination,
            
            currentSort: req.query.sort,
            currentLoai: req.query.loaisanpham,
            currentGioiTinh: req.query.gioitinh,
            priceMin: req.query.priceMin,
            priceMax: req.query.priceMax,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            currentDeleted: deleted,
            filterString
        });

    } catch (error) {
        console.error('Load products error:', error);
        res.status(500).send('Không tải được danh sách sản phẩm');
    }
};

// [POST] /admin/products/:id/restore
const restoreProduct = async (req, res) => {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            req.flash('error', 'ID không hợp lệ');
            return res.redirect('back');
        }

        await Product.findByIdAndUpdate(id, { daxoa: false });
        req.flash('success', 'Đã khôi phục sản phẩm!');
        return res.redirect('back');
    } catch (error) {
        console.error('Restore product error:', error);
        req.flash('error', 'Không thể khôi phục sản phẩm');
        return res.redirect('back');
    }
};

// [POST] /admin/products/:id/hard-delete
const hardDeleteProduct = async (req, res) => {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            req.flash('error', 'ID không hợp lệ');
            return res.redirect('back');
        }

        const result = await Product.deleteOne({ _id: id, daxoa: true });
        if (!result || result.deletedCount !== 1) {
            req.flash('error', 'Chỉ được xóa vĩnh viễn sản phẩm đã xóa mềm');
            return res.redirect('back');
        }

        req.flash('success', 'Đã xóa vĩnh viễn sản phẩm!');
        return res.redirect(req.app.locals.admin + '/products?deleted=1');
    } catch (error) {
        console.error('Hard delete product error:', error);
        req.flash('error', 'Không thể xóa vĩnh viễn sản phẩm');
        return res.redirect('back');
    }
};

// [GET] /admin/products/create
const create = async (req, res) => {
    try {
        res.render("admin/pages/products/create.pug", {
            titlePage: "Thêm sản phẩm mới"
        });
    } catch (error) {
        console.error('Create product page error:', error);
        res.status(500).send('Không thể tải trang thêm sản phẩm');
    }
};

// [POST] /admin/products/create
const createPost = async (req, res) => {
    try {
        const isNoSizeProduct = isNoSizeProductType(req.body.loaisanpham);
        const { baseSizes, tongSizeGoc, soluong_chinh } = buildBaseSizes(req.body, isNoSizeProduct);
        
        
        const productData = {
            tensanpham: req.body.tensanpham,
            mota: req.body.mota,
            gia: parseInt(req.body.gia) || 0,
            phantramgiamgia: parseInt(req.body.phantramgiamgia) || 0,
            mausac_chinh: req.body.mausac_chinh || '',
            sizes: baseSizes,
            soluong_chinh: soluong_chinh,
            soluongton: tongSizeGoc,
            gioitinh: req.body.gioitinh,
            loaisanpham: req.body.loaisanpham,
            trangthai: req.body.trangthai || 'dangban',
            daxoa: false,
            ngaytao: new Date()
        };

        const { variants, tongBienThe } = buildVariantsFromRequest({
            reqBody: req.body,
            reqFiles: req.files,
            isNoSizeProduct
        });

        if (variants.length) {
            // Với create: ảnh biến thể được lấy theo đúng index upload
            const bientheImages = req.files && req.files['bienthe_hinhanh'] ? req.files['bienthe_hinhanh'] : [];
            productData.bienthe = variants.map((v, idx) => ({
                ...v,
                hinhanh: bientheImages[idx] ? '/uploads/products/' + bientheImages[idx].filename : v.hinhanh
            }));
            productData.soluongton = tongSizeGoc + tongBienThe;
        }

        // Xử lý upload ảnh chính
        if (req.files && req.files['hinhanh'] && req.files['hinhanh'][0]) {
            productData.hinhanh = '/uploads/products/' + req.files['hinhanh'][0].filename;
        }

        // Tạo sản phẩm mới
        const product = new Product(productData);
        await product.save();

        req.flash('success', 'Thêm sản phẩm thành công!');
        res.redirect(req.app.locals.admin + '/products');
    } catch (error) {
        console.error('Create product error:', error);
        req.flash('error', 'Không thể tạo sản phẩm: ' + error.message);
        res.redirect('back');
    }
};

// [GET] /admin/products/:id/edit
const edit = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).lean();
        
        if (!product) {
            return res.status(404).send('Không tìm thấy sản phẩm');
        }

        res.render("admin/pages/products/edit.pug", {
            titlePage: "Chỉnh sửa sản phẩm",
            product: productHelper(product)
        });
    } catch (error) {
        console.error('Edit product page error:', error);
        res.status(500).send('Không thể tải trang chỉnh sửa sản phẩm');
    }
};

// [POST] /admin/products/:id/edit
const editPost = async (req, res) => {
    try {
        // Lấy sản phẩm hiện tại để giữ lại ảnh cũ nếu không upload mới
        const currentProduct = await Product.findById(req.params.id).lean();
        
        const isNoSizeProduct = isNoSizeProductType(req.body.loaisanpham);
        const { baseSizes, tongSizeGoc, soluong_chinh } = buildBaseSizes(req.body, isNoSizeProduct);
        
        const productData = {
            tensanpham: req.body.tensanpham,
            mota: req.body.mota,
            gia: parseInt(req.body.gia) || 0,
            phantramgiamgia: parseInt(req.body.phantramgiamgia) || 0,
            mausac_chinh: req.body.mausac_chinh || '',
            sizes: baseSizes,
            soluong_chinh: soluong_chinh,
            soluongton: tongSizeGoc,
            gioitinh: req.body.gioitinh,
            loaisanpham: req.body.loaisanpham,
            trangthai: req.body.trangthai
        };

        const oldImageArr = Array.isArray(req.body.bienthe_hinhanh_cu) ? req.body.bienthe_hinhanh_cu : [req.body.bienthe_hinhanh_cu];
        const hasNewImageArr = Array.isArray(req.body.bienthe_has_new_image) ? req.body.bienthe_has_new_image : [req.body.bienthe_has_new_image];

        const { variants: editVariants, tongBienThe: tongBienTheEdit } = buildVariantsFromRequest({
            reqBody: req.body,
            reqFiles: req.files,
            isNoSizeProduct,
            oldImageArr,
            hasNewImageArr
        });

        if (editVariants.length) {
            productData.bienthe = editVariants;
            productData.soluongton = tongSizeGoc + tongBienTheEdit;
        } else {
            productData.bienthe = [];
        }

        // Xử lý upload ảnh chính mới
        if (req.files && req.files['hinhanh'] && req.files['hinhanh'][0]) {
            productData.hinhanh = '/uploads/products/' + req.files['hinhanh'][0].filename;
        }

        await Product.findByIdAndUpdate(req.params.id, productData);

        req.flash('success', 'Cập nhật sản phẩm thành công!');
        res.redirect(req.app.locals.admin + '/products');
    } catch (error) {
        console.error('Update product error:', error);
        req.flash('error', 'Không thể cập nhật sản phẩm: ' + error.message);
        res.redirect('back');
    }
};

// [GET] /admin/products/:id/delete (Soft delete)
const deleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.params.id, { daxoa: true });
        req.flash('success', 'Xóa sản phẩm thành công!');
        res.redirect(req.app.locals.admin + '/products');
    } catch (error) {
        console.error('Delete product error:', error);
        req.flash('error', 'Không thể xóa sản phẩm');
        res.redirect('back');
    }
};

// [PATCH] /admin/products/:id/change-status
const changeStatus = async (req, res) => {
    try {
        const { status } = req.body;
        await Product.findByIdAndUpdate(req.params.id, { trangthai: status });
        res.json({ success: true });
    } catch (error) {
        console.error('Change status error:', error);
        res.status(500).json({ success: false, message: 'Không thể thay đổi trạng thái' });
    }
};

module.exports = { 
    index,
    create,
    createPost,
    edit,
    editPost,
    delete: deleteProduct,
    restore: restoreProduct,
    hardDelete: hardDeleteProduct,
    changeStatus
};
