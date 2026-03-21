const productsAdminService = require('../../services/catalog/admin-products.service.js');

// Danh sách
const danhSach = async (req, res) => {
    try {
        const viewData = await productsAdminService.getDanhSachData(req.query || {});
        res.render('admin/pages/products/index.pug', viewData);

    } catch (error) {
        console.error('Load products error:', error);
        res.status(500).send('Không tải được danh sách sản phẩm');
    }
};

// Khôi phục
const khoiPhuc = async (req, res) => {
    try {
        const result = await productsAdminService.khoiPhucSanPham(req.params.id);
        req.flash(result.ok ? 'success' : 'error', result.message);
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
        const result = await productsAdminService.xoaVinhVienSanPham(req.params.id);
        if (!result.ok) {
            req.flash('error', result.message);
            return res.redirect('back');
        }

        req.flash('success', result.message);
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
        const viewData = await productsAdminService.getTaoMoiData();
        res.render("admin/pages/products/create.pug", {
            ...viewData
        });
    } catch (error) {
        console.error('Create product page error:', error);
        res.status(500).send('Không thể tải trang thêm sản phẩm');
    }
};

// Tạo mới
const taoMoiPost = async (req, res) => {
    try {
        const result = await productsAdminService.taoMoiSanPham(req.body, req.files);
        req.flash(result.ok ? 'success' : 'error', result.message);
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
        const result = await productsAdminService.getChinhSuaData(req.params.id);
        if (!result.ok) {
            return res.status(404).send('Không tìm thấy sản phẩm');
        }

        res.render("admin/pages/products/edit.pug", result.data);
    } catch (error) {
        console.error('Edit product page error:', error);
        res.status(500).send('Không thể tải trang chỉnh sửa sản phẩm');
    }
};

// Chỉnh sửa
const chinhSuaPost = async (req, res) => {
    try {
        const result = await productsAdminService.capNhatSanPham(req.params.id, req.body, req.files);
        req.flash(result.ok ? 'success' : 'error', result.message);
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
        const result = await productsAdminService.xoaMemSanPham(req.params.id);
        if (!result.ok) {
            req.flash('error', result.message);
            return res.redirect('back');
        }

        req.flash('success', result.message);
        return res.redirect(req.app.locals.admin + '/products');
    } catch (error) {
        console.error('Delete product error:', error);
        req.flash('error', 'Không thể xóa sản phẩm');
        res.redirect('back');
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
    xoaVinhVien
};
