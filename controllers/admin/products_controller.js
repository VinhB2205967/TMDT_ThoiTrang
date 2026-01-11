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
        if (req.query.loaisanpham) {
            find.loaisanpham = req.query.loaisanpham;
        }
        
        // Lọc theo giới tính
        if (req.query.gioitinh) {
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

        // Sắp xếp
        let sort = { ngaytao: -1 };
        if (req.query.sort) {
            const [key, value] = req.query.sort.split('-');
            sort = { [key]: value === 'asc' ? 1 : -1 };
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
            filterString
        });

    } catch (error) {
        console.error('Load products error:', error);
        res.status(500).send('Không tải được danh sách sản phẩm');
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
        // Xử lý sizes gốc (mỗi size có số lượng riêng)
        const sizeList = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
        const baseSizes = [];
        let tongSizeGoc = 0;
        
        sizeList.forEach(size => {
            const qty = parseInt(req.body[`size_${size}`]) || 0;
            if (qty > 0) {
                baseSizes.push({ size: size, soluong: qty });
                tongSizeGoc += qty;
            }
        });
        
        
        const productData = {
            tensanpham: req.body.tensanpham,
            mota: req.body.mota,
            gia: parseInt(req.body.gia) || 0,
            phantramgiamgia: parseInt(req.body.phantramgiamgia) || 0,
            mausac_chinh: req.body.mausac_chinh || '',
            sizes: baseSizes,
            soluongton: tongSizeGoc,
            gioitinh: req.body.gioitinh,
            loaisanpham: req.body.loaisanpham,
            trangthai: req.body.trangthai || 'dangban',
            daxoa: false,
            ngaytao: new Date()
        };

        // Xử lý biến thể với sizes
        if (req.body.bienthe_mausac) {
            const mausacArr = Array.isArray(req.body.bienthe_mausac) ? req.body.bienthe_mausac : [req.body.bienthe_mausac];
            const giaArr = Array.isArray(req.body.bienthe_gia) ? req.body.bienthe_gia : [req.body.bienthe_gia];
            const giamgiaArr = Array.isArray(req.body.bienthe_giamgia) ? req.body.bienthe_giamgia : [req.body.bienthe_giamgia];
            
            // Lấy ảnh biến thể
            const bientheImages = req.files && req.files['bienthe_hinhanh'] ? req.files['bienthe_hinhanh'] : [];
            
            let tongBienThe = 0;
            productData.bienthe = mausacArr.map((mausac, i) => {
                // Lấy sizes cho biến thể này
                const variantSizes = [];
                sizeList.forEach(size => {
                    const qty = parseInt(req.body[`bienthe_${i}_size_${size}`]) || 0;
                    if (qty > 0) {
                        variantSizes.push({ size: size, soluong: qty });
                        tongBienThe += qty;
                    }
                });
                
                return {
                    mausac: mausac,
                    gia: parseInt(giaArr[i]) || null,
                    phantramgiamgia: parseInt(giamgiaArr[i]) || 0,
                    hinhanh: bientheImages[i] ? '/uploads/products/' + bientheImages[i].filename : null,
                    sizes: variantSizes
                };
            }).filter(bt => bt.mausac && bt.mausac.trim() !== '');
            
            // Tổng số lượng tồn = tổng size gốc + tổng size biến thể
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
        
        // Xử lý sizes gốc (mỗi size có số lượng riêng)
        const sizeList = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
        const baseSizes = [];
        let tongSizeGoc = 0;
        
        sizeList.forEach(size => {
            const qty = parseInt(req.body[`size_${size}`]) || 0;
            if (qty > 0) {
                baseSizes.push({ size: size, soluong: qty });
                tongSizeGoc += qty;
            }
        });
        
        const productData = {
            tensanpham: req.body.tensanpham,
            mota: req.body.mota,
            gia: parseInt(req.body.gia) || 0,
            phantramgiamgia: parseInt(req.body.phantramgiamgia) || 0,
            mausac_chinh: req.body.mausac_chinh || '',
            sizes: baseSizes,
            soluongton: tongSizeGoc,
            gioitinh: req.body.gioitinh,
            loaisanpham: req.body.loaisanpham,
            trangthai: req.body.trangthai
        };

        // Xử lý biến thể với sizes
        if (req.body.bienthe_mausac) {
            const mausacArr = Array.isArray(req.body.bienthe_mausac) ? req.body.bienthe_mausac : [req.body.bienthe_mausac];
            const giaArr = Array.isArray(req.body.bienthe_gia) ? req.body.bienthe_gia : [req.body.bienthe_gia];
            const giamgiaArr = Array.isArray(req.body.bienthe_giamgia) ? req.body.bienthe_giamgia : [req.body.bienthe_giamgia];
            const oldImageArr = Array.isArray(req.body.bienthe_hinhanh_cu) ? req.body.bienthe_hinhanh_cu : [req.body.bienthe_hinhanh_cu];
            const hasNewImageArr = Array.isArray(req.body.bienthe_has_new_image) ? req.body.bienthe_has_new_image : [req.body.bienthe_has_new_image];
            
            // Lấy ảnh biến thể mới upload
            const bientheImages = req.files && req.files['bienthe_hinhanh'] ? req.files['bienthe_hinhanh'] : [];
            let imageIndex = 0;
            
            let tongBienThe = 0;
            productData.bienthe = mausacArr.map((mausac, i) => {
                let hinhanh = oldImageArr[i] || null; // Giữ ảnh cũ
                
                // Kiểm tra xem biến thể này có upload ảnh mới không
                if (hasNewImageArr[i] === '1' && bientheImages[imageIndex]) {
                    hinhanh = '/uploads/products/' + bientheImages[imageIndex].filename;
                    imageIndex++;
                }
                
                // Lấy sizes cho biến thể này
                const variantSizes = [];
                sizeList.forEach(size => {
                    const qty = parseInt(req.body[`bienthe_${i}_size_${size}`]) || 0;
                    if (qty > 0) {
                        variantSizes.push({ size: size, soluong: qty });
                        tongBienThe += qty;
                    }
                });
                
                return {
                    mausac: mausac,
                    gia: parseInt(giaArr[i]) || null,
                    phantramgiamgia: parseInt(giamgiaArr[i]) || 0,
                    hinhanh: hinhanh,
                    sizes: variantSizes
                };
            }).filter(bt => bt.mausac && bt.mausac.trim() !== '');
            
            // Tổng số lượng tồn = tổng size gốc + tổng size biến thể
            productData.soluongton = tongSizeGoc + tongBienThe;
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
    changeStatus
};
