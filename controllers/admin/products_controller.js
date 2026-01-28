const sanpham = require('../../models/product_model');
const mongoose = require('mongoose');
const filterStatusHelper = require('../../helpers/filterStatus');
const searchHelper = require('../../helpers/search');
const paginationHelper = require('../../helpers/pagination');
const productHelper = require('../../helpers/product');
const { prepareProductData } = require('../../services/product.service');

// Danh sách
const danhSach = async (req, res) => {
    try {
        // Lọc trạng thái
        const boloctrangthai = filterStatusHelper(req.query);

        // Tìm kiếm
        const doituongtimkiem = searchHelper(req.query, { keywordKey: 'keyword' });

        // Phân trang
        let phantrang = {
            currentPage: 1,
            limit: 10
        };

        // Xây dựng điều kiện lọc
        const daxoa = String(req.query.deleted || '').trim();
        const dieukien =
            daxoa === '1' ? { daxoa: true }
                : daxoa === 'all' ? {}
                    : { daxoa: { $ne: true } };
        
        // Lọc theo trạng thái
        if (req.query.trangthai === 'dahet') {
            // Đã hết: soluongton = 0 hoặc không có
            dieukien.soluongton = { $lte: 0 };
        } else if (req.query.trangthai) {
            dieukien.trangthai = req.query.trangthai;
        }
        
        if (doituongtimkiem.keyword) dieukien.tensanpham = doituongtimkiem.regex;

        // Lọc theo giá (giá đã giảm = gia * (100 - phantramgiamgia) / 100)
        if (req.query.priceMin || req.query.priceMax) {
            const giatu = parseInt(req.query.priceMin) || 0;
            const giaden = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;
            
            // Sử dụng $expr để tính giá sau giảm
            dieukien.$expr = {
                $and: [
                    {
                        $gte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giatu
                        ]
                    },
                    {
                        $lte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giaden
                        ]
                    }
                ]
            };
        }

        // Lọc theo loại sản phẩm
        const taploaichophep = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
        if (req.query.loaisanpham && taploaichophep.has(req.query.loaisanpham)) {
            dieukien.loaisanpham = req.query.loaisanpham;
        }

        // Lọc theo giới tính
        const tapgioitinhchophep = new Set(['nam', 'nu', 'unisex']);
        if (req.query.gioitinh && tapgioitinhchophep.has(req.query.gioitinh)) {
            dieukien.gioitinh = req.query.gioitinh;
        }

        // Lọc theo ngày tạo
        if (req.query.dateFrom || req.query.dateTo) {
            dieukien.ngaycapnhat = {};
            if (req.query.dateFrom) dieukien.ngaycapnhat.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) {
                const ngayketthuc = new Date(req.query.dateTo);
                ngayketthuc.setHours(23, 59, 59, 999);
                dieukien.ngaycapnhat.$lte = ngayketthuc;
            }
        }

        // Sắp xếp (whitelist)
        let sapxep = { ngaytao: -1 };
        let khoasapxep = 'ngaytao';
        let chieusapxep = -1;
        if (req.query.sort) {
            const [khoa, huong] = String(req.query.sort).split('-');
            const tapkhoasapxep = new Set(['gia', 'ngaytao', 'tensanpham']);
            const tapchieusapxep = new Set(['asc', 'desc']);
            if (tapkhoasapxep.has(khoa) && tapchieusapxep.has(huong)) {
                khoasapxep = khoa;
                chieusapxep = huong === 'asc' ? 1 : -1;
                sapxep = { [khoa]: chieusapxep };
            }
        }

        // Count & Pagination
        const tongsanpham = await sanpham.countDocuments(dieukien);
        phantrang = paginationHelper(phantrang, req.query, tongsanpham);

        // Get products
        // NOTE: when sorting by price, use discounted price (gia after giamgia)
        let danhsachsanpham;
        if (khoasapxep === 'gia') {
            const bieuthucgiagiam = {
                $multiply: [
                    { $ifNull: ['$gia', 0] },
                    {
                        $divide: [
                            { $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] },
                            100
                        ]
                    }
                ]
            };

            danhsachsanpham = await sanpham.aggregate([
                { $match: dieukien },
                { $addFields: { __giaSauGiam: bieuthucgiagiam } },
                { $sort: { __giaSauGiam: chieusapxep, ngaytao: -1 } },
                { $skip: phantrang.skip },
                { $limit: phantrang.limit }
            ]);
        } else {
            danhsachsanpham = await sanpham.find(dieukien)
                .sort(sapxep)
                .skip(phantrang.skip)
                .limit(phantrang.limit)
                .lean();
        }

        let chuoiboloc = '';
        if (req.query.sort) chuoiboloc += `&sort=${req.query.sort}`;
        if (req.query.loaisanpham) chuoiboloc += `&loaisanpham=${req.query.loaisanpham}`;
        if (req.query.gioitinh) chuoiboloc += `&gioitinh=${req.query.gioitinh}`;
        if (req.query.priceMin) chuoiboloc += `&priceMin=${req.query.priceMin}`;
        if (req.query.priceMax) chuoiboloc += `&priceMax=${req.query.priceMax}`;
        if (req.query.dateFrom) chuoiboloc += `&dateFrom=${req.query.dateFrom}`;
        if (req.query.dateTo) chuoiboloc += `&dateTo=${req.query.dateTo}`;
        if (req.query.deleted) chuoiboloc += `&deleted=${req.query.deleted}`;

        res.render("admin/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: danhsachsanpham.map(productHelper),
            filterStatus: boloctrangthai,
            keyword: doituongtimkiem.keyword,
            pagination: phantrang,
            
            currentSort: req.query.sort,
            currentLoai: req.query.loaisanpham,
            currentGioiTinh: req.query.gioitinh,
            priceMin: req.query.priceMin,
            priceMax: req.query.priceMax,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            currentDeleted: daxoa,
            filterString: chuoiboloc
        });

    } catch (error) {
        console.error('Load products error:', error);
        res.status(500).send('Không tải được danh sách sản phẩm');
    }
};

// Khôi phục
const khoiPhuc = async (req, res) => {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            req.flash('error', 'ID không hợp lệ');
            const fallbackUrl = (req.app.locals.admin || '/admin') + '/products?deleted=1';
            return res.redirect(req.get('Referrer') || fallbackUrl);
        }

        await sanpham.findByIdAndUpdate(id, { daxoa: false, ngaycapnhat: new Date() });
        req.flash('success', 'Đã khôi phục sản phẩm!');
        const fallbackUrl = (req.app.locals.admin || '/admin') + '/products?deleted=1';
        return res.redirect(req.get('Referrer') || fallbackUrl);
    } catch (error) {
        console.error('Restore product error:', error);
        req.flash('error', 'Không thể khôi phục sản phẩm');
        const fallbackUrl = (req.app.locals.admin || '/admin') + '/products?deleted=1';
        return res.redirect(req.get('Referrer') || fallbackUrl);
    }
};

// Xóa vĩnh viễn
const xoaVinhVien = async (req, res) => {
    try {
        const id = String(req.params.id || '');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            req.flash('error', 'ID không hợp lệ');
            return res.redirect('back');
        }

        const result = await sanpham.deleteOne({ _id: id, daxoa: true });
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

// Tạo mới
const taoMoi = async (req, res) => {
    try {
        res.render("admin/pages/products/create.pug", {
            titlePage: "Thêm sản phẩm mới"
        });
    } catch (error) {
        console.error('Create product page error:', error);
        res.status(500).send('Không thể tải trang thêm sản phẩm');
    }
};

// Tạo mới
const taoMoiPost = async (req, res) => {
    try {
        const dulieusanpham = prepareProductData(req.body, req.files);
        dulieusanpham.daxoa = false;
        dulieusanpham.ngaytao = new Date();
        dulieusanpham.ngaycapnhat = new Date();

        // Tạo sản phẩm mới
        const sanphammoi = new sanpham(dulieusanpham);
        await sanphammoi.save();

        req.flash('success', 'Thêm sản phẩm thành công!');
        res.redirect(req.app.locals.admin + '/products');
    } catch (error) {
        console.error('Create product error:', error);
        req.flash('error', 'Không thể tạo sản phẩm: ' + error.message);
        res.redirect('back');
    }
};

// Chỉnh sửa
const chinhSua = async (req, res) => {
    try {
        const sanphamdoc = await sanpham.findById(req.params.id).lean();
        
        if (!sanphamdoc) {
            return res.status(404).send('Không tìm thấy sản phẩm');
        }

        res.render("admin/pages/products/edit.pug", {
            titlePage: "Chỉnh sửa sản phẩm",
            product: productHelper(sanphamdoc)
        });
    } catch (error) {
        console.error('Edit product page error:', error);
        res.status(500).send('Không thể tải trang chỉnh sửa sản phẩm');
    }
};

// Chỉnh sửa
const chinhSuaPost = async (req, res) => {
    try {
        const dulieusanpham = prepareProductData(req.body, req.files);
        dulieusanpham.ngaycapnhat = new Date();

        await sanpham.findByIdAndUpdate(req.params.id, dulieusanpham);

        req.flash('success', 'Cập nhật sản phẩm thành công!');
        res.redirect(req.app.locals.admin + '/products');
    } catch (error) {
        console.error('Update product error:', error);
        req.flash('error', 'Không thể cập nhật sản phẩm: ' + error.message);
        res.redirect('back');
    }
};

// Xóa mềm
const xoaMem = async (req, res) => {
    try {
        await sanpham.findByIdAndUpdate(req.params.id, { daxoa: true, ngaycapnhat: new Date() });
        req.flash('success', 'Xóa sản phẩm thành công!');
        res.redirect(req.app.locals.admin + '/products');
    } catch (error) {
        console.error('Delete product error:', error);
        req.flash('error', 'Không thể xóa sản phẩm');
        res.redirect('back');
    }
};

// Đổi trạng thái
const doiTrangThai = async (req, res) => {
    try {
        const { status } = req.body;
        await sanpham.findByIdAndUpdate(req.params.id, { trangthai: status, ngaycapnhat: new Date() });
        res.json({ success: true });
    } catch (error) {
        console.error('Change status error:', error);
        res.status(500).json({ success: false, message: 'Không thể thay đổi trạng thái' });
    }
};

module.exports = { 
    danhSach,
    taoMoi,
    taoMoiPost,
    chinhSua,
    chinhSuaPost,
    xoaMem,
    khoiPhuc,
    xoaVinhVien,
    doiTrangThai
};
