const Product = require('../../models/product_model');
const mongoose = require('mongoose');
const filterStatusHelper = require('../../helpers/filterStatus');
const searchHelper = require('../../helpers/search');
const paginationHelper = require('../../helpers/pagination');
const productHelper = require('../../helpers/product');
// Loại không size
const LOAI_KHONG_SIZE = ['tui', 'phukien'];
const DANH_SACH_SIZE = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
// Kiểm tra size
function laLoaiKhongSize(loaisanpham) {
    return LOAI_KHONG_SIZE.includes(loaisanpham);
}
// Size gốc
function taoSizeGoc(reqBody, isNoSizeProduct) {
    const baseSizes = [];
    let tongSizeGoc = 0;
    let soluong_chinh = 0;
// không có size
    if (isNoSizeProduct) {
        soluong_chinh = parseInt(reqBody.soluong_chinh) || 0;
        tongSizeGoc = soluong_chinh;
        return { baseSizes, tongSizeGoc, soluong_chinh };
    }
// có size
    DANH_SACH_SIZE.forEach(size => {
        const qty = parseInt(reqBody[`size_${size}`]) || 0;
        if (qty > 0) {
            baseSizes.push({ size: size, soluong: qty });
            tongSizeGoc += qty;
        }
    });

    return { baseSizes, tongSizeGoc, soluong_chinh };
}
// Biến thể
function bienThe({ reqBody, reqFiles, isNoSizeProduct, oldImageArr = [], hasNewImageArr = [] }) {
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
            DANH_SACH_SIZE.forEach(size => {
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

// Danh sách
const danhSach = async (req, res) => {
    try {
        // Lọc trạng thái
        const boLocTrangThai = filterStatusHelper(req.query);

        // Tìm kiếm
        const doiTuongTimKiem = searchHelper(req.query, { keywordKey: 'keyword' });

        // Phân trang
        let phanTrang = {
            currentPage: 1,
            limit: 10
        };

        // Xây dựng điều kiện lọc
        const daXoa = String(req.query.deleted || '').trim();
        const dieuKien =
            daXoa === '1' ? { daxoa: true }
                : daXoa === 'all' ? {}
                    : { daxoa: { $ne: true } };
        
        // Lọc theo trạng thái
        if (req.query.trangthai === 'dahet') {
            // Đã hết: soluongton = 0 hoặc không có
            dieuKien.soluongton = { $lte: 0 };
        } else if (req.query.trangthai) {
            dieuKien.trangthai = req.query.trangthai;
        }
        
        if (doiTuongTimKiem.keyword) dieuKien.tensanpham = doiTuongTimKiem.regex;

        // Lọc theo giá (giá đã giảm = gia * (100 - phantramgiamgia) / 100)
        if (req.query.priceMin || req.query.priceMax) {
            const giaTu = parseInt(req.query.priceMin) || 0;
            const giaDen = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;
            
            // Sử dụng $expr để tính giá sau giảm
            dieuKien.$expr = {
                $and: [
                    {
                        $gte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giaTu
                        ]
                    },
                    {
                        $lte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giaDen
                        ]
                    }
                ]
            };
        }

        // Lọc theo loại sản phẩm
        const tapLoaiChoPhep = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
        if (req.query.loaisanpham && tapLoaiChoPhep.has(req.query.loaisanpham)) {
            dieuKien.loaisanpham = req.query.loaisanpham;
        }

        // Lọc theo giới tính
        const tapGioiTinhChoPhep = new Set(['nam', 'nu', 'unisex']);
        if (req.query.gioitinh && tapGioiTinhChoPhep.has(req.query.gioitinh)) {
            dieuKien.gioitinh = req.query.gioitinh;
        }

        // Lọc theo ngày tạo
        if (req.query.dateFrom || req.query.dateTo) {
            dieuKien.ngaytao = {};
            if (req.query.dateFrom) dieuKien.ngaytao.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) {
                const ngayKetThuc = new Date(req.query.dateTo);
                ngayKetThuc.setHours(23, 59, 59, 999);
                dieuKien.ngaytao.$lte = ngayKetThuc;
            }
        }

        // Sắp xếp (whitelist)
        let sapXep = { ngaytao: -1 };
        let khoaSapXep = 'ngaytao';
        let chieuSapXep = -1;
        if (req.query.sort) {
            const [khoa, huong] = String(req.query.sort).split('-');
            const tapKhoaSapXep = new Set(['gia', 'ngaytao', 'tensanpham']);
            const tapChieuSapXep = new Set(['asc', 'desc']);
            if (tapKhoaSapXep.has(khoa) && tapChieuSapXep.has(huong)) {
                khoaSapXep = khoa;
                chieuSapXep = huong === 'asc' ? 1 : -1;
                sapXep = { [khoa]: chieuSapXep };
            }
        }

        // Count & Pagination
        const tongSanPham = await Product.countDocuments(dieuKien);
        phanTrang = paginationHelper(phanTrang, req.query, tongSanPham);

        // Get products
        // NOTE: when sorting by price, use discounted price (gia after giamgia)
        let danhSachSanPham;
        if (khoaSapXep === 'gia') {
            const bieuThucGiaGiam = {
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

            danhSachSanPham = await Product.aggregate([
                { $match: dieuKien },
                { $addFields: { __giaSauGiam: bieuThucGiaGiam } },
                { $sort: { __giaSauGiam: chieuSapXep, ngaytao: -1 } },
                { $skip: phanTrang.skip },
                { $limit: phanTrang.limit }
            ]);
        } else {
            danhSachSanPham = await Product.find(dieuKien)
                .sort(sapXep)
                .skip(phanTrang.skip)
                .limit(phanTrang.limit)
                .lean();
        }

        let chuoiBoLoc = '';
        if (req.query.sort) chuoiBoLoc += `&sort=${req.query.sort}`;
        if (req.query.loaisanpham) chuoiBoLoc += `&loaisanpham=${req.query.loaisanpham}`;
        if (req.query.gioitinh) chuoiBoLoc += `&gioitinh=${req.query.gioitinh}`;
        if (req.query.priceMin) chuoiBoLoc += `&priceMin=${req.query.priceMin}`;
        if (req.query.priceMax) chuoiBoLoc += `&priceMax=${req.query.priceMax}`;
        if (req.query.dateFrom) chuoiBoLoc += `&dateFrom=${req.query.dateFrom}`;
        if (req.query.dateTo) chuoiBoLoc += `&dateTo=${req.query.dateTo}`;
        if (req.query.deleted) chuoiBoLoc += `&deleted=${req.query.deleted}`;

        res.render("admin/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: danhSachSanPham.map(productHelper),
            filterStatus: boLocTrangThai,
            keyword: doiTuongTimKiem.keyword,
            pagination: phanTrang,
            
            currentSort: req.query.sort,
            currentLoai: req.query.loaisanpham,
            currentGioiTinh: req.query.gioitinh,
            priceMin: req.query.priceMin,
            priceMax: req.query.priceMax,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            currentDeleted: daXoa,
            filterString: chuoiBoLoc
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

// Xóa vĩnh viễn
const xoaVinhVien = async (req, res) => {
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
        const laKhongSize = laLoaiKhongSize(req.body.loaisanpham);
        const { baseSizes: sizesGoc, tongSizeGoc, soluong_chinh: soLuongChinh } = taoSizeGoc(req.body, laKhongSize);
        
        
        const duLieuSanPham = {
            tensanpham: req.body.tensanpham,
            mota: req.body.mota,
            gia: parseInt(req.body.gia) || 0,
            phantramgiamgia: parseInt(req.body.phantramgiamgia) || 0,
            mausac_chinh: req.body.mausac_chinh || '',
            sizes: sizesGoc,
            soluong_chinh: soLuongChinh,
            soluongton: tongSizeGoc,
            gioitinh: req.body.gioitinh,
            loaisanpham: req.body.loaisanpham,
            trangthai: req.body.trangthai || 'dangban',
            daxoa: false,
            ngaytao: new Date()
        };

        const { variants: danhSachBienThe, tongBienThe } = bienThe({
            reqBody: req.body,
            reqFiles: req.files,
            isNoSizeProduct: laKhongSize
        });

        if (danhSachBienThe.length) {
            // Với create: ảnh biến thể được lấy theo đúng index upload
            const anhBienThe = req.files && req.files['bienthe_hinhanh'] ? req.files['bienthe_hinhanh'] : [];
            duLieuSanPham.bienthe = danhSachBienThe.map((v, idx) => ({
                ...v,
                hinhanh: anhBienThe[idx] ? '/uploads/products/' + anhBienThe[idx].filename : v.hinhanh
            }));
            duLieuSanPham.soluongton = tongSizeGoc + tongBienThe;
        }

        // Xử lý upload ảnh chính
        if (req.files && req.files['hinhanh'] && req.files['hinhanh'][0]) {
            duLieuSanPham.hinhanh = '/uploads/products/' + req.files['hinhanh'][0].filename;
        }

        // Tạo sản phẩm mới
        const sanPham = new Product(duLieuSanPham);
        await sanPham.save();

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

// Chỉnh sửa
const chinhSuaPost = async (req, res) => {
    try {
        // Lấy sản phẩm hiện tại để giữ lại ảnh cũ nếu không upload mới
        const sanPhamHienTai = await Product.findById(req.params.id).lean();
        
        const laKhongSize = laLoaiKhongSize(req.body.loaisanpham);
        const { baseSizes: sizesGoc, tongSizeGoc, soluong_chinh: soLuongChinh } = taoSizeGoc(req.body, laKhongSize);
        
        const duLieuSanPham = {
            tensanpham: req.body.tensanpham,
            mota: req.body.mota,
            gia: parseInt(req.body.gia) || 0,
            phantramgiamgia: parseInt(req.body.phantramgiamgia) || 0,
            mausac_chinh: req.body.mausac_chinh || '',
            sizes: sizesGoc,
            soluong_chinh: soLuongChinh,
            soluongton: tongSizeGoc,
            gioitinh: req.body.gioitinh,
            loaisanpham: req.body.loaisanpham,
            trangthai: req.body.trangthai
        };

        const anhCuArr = Array.isArray(req.body.bienthe_hinhanh_cu) ? req.body.bienthe_hinhanh_cu : [req.body.bienthe_hinhanh_cu];
        const coAnhMoiArr = Array.isArray(req.body.bienthe_has_new_image) ? req.body.bienthe_has_new_image : [req.body.bienthe_has_new_image];

        const { variants: bienTheChinhSua, tongBienThe: tongBienTheEdit } = bienThe({
            reqBody: req.body,
            reqFiles: req.files,
            isNoSizeProduct: laKhongSize,
            oldImageArr: anhCuArr,
            hasNewImageArr: coAnhMoiArr
        });

        if (bienTheChinhSua.length) {
            duLieuSanPham.bienthe = bienTheChinhSua;
            duLieuSanPham.soluongton = tongSizeGoc + tongBienTheEdit;
        } else {
            duLieuSanPham.bienthe = [];
        }

        // Xử lý upload ảnh chính mới
        if (req.files && req.files['hinhanh'] && req.files['hinhanh'][0]) {
            duLieuSanPham.hinhanh = '/uploads/products/' + req.files['hinhanh'][0].filename;
        }

        await Product.findByIdAndUpdate(req.params.id, duLieuSanPham);

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
        await Product.findByIdAndUpdate(req.params.id, { daxoa: true });
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
        await Product.findByIdAndUpdate(req.params.id, { trangthai: status });
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
