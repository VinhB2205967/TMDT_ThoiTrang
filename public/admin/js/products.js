/**
 * Products Management - Admin JavaScript
 * Quản lý sản phẩm: thêm, sửa, biến thể, tồn kho
 */

// ===== LOẠI SẢN PHẨM KHÔNG CẦN SIZE =====
const loaiKhongSize = ['tui', 'phukien'];

// ===== CHECK IF CURRENT PRODUCT NEEDS SIZE =====
const laSanPhamKhongSize = () => {
    const chonLoai = document.getElementById('loaisanpham');
    if (!chonLoai) return false;
    return loaiKhongSize.includes(chonLoai.value);
};

// ===== TOGGLE SIZE FIELDS =====
const doiHienThiSize = () => {
    const laKhongSize = laSanPhamKhongSize();
    
    // Toggle base size section
    const baseSizeSection = document.getElementById('baseSizeSection');
    if (baseSizeSection) {
        baseSizeSection.style.display = laKhongSize ? 'none' : 'block';
    }
    
    // Toggle base quantity section (cho sản phẩm không có size)
    const baseQtySection = document.getElementById('baseQtySection');
    if (baseQtySection) {
        baseQtySection.style.display = laKhongSize ? 'block' : 'none';
    }
    
    // Toggle size fields in all variants
    document.querySelectorAll('.variant-size-section').forEach(el => {
        el.style.display = laKhongSize ? 'none' : 'block';
    });
    
    // Toggle quantity field in all variants
    document.querySelectorAll('.variant-qty-section').forEach(el => {
        el.style.display = laKhongSize ? 'block' : 'none';
    });
    
    // Update total stock
    capNhatTongTon();
};

// ===== CONFIRM DELETE =====
window.xacNhanXoa = window.xacNhanXoa || ((thongBao = 'Bạn có chắc muốn xóa sản phẩm này?') => {
    return confirm(thongBao);
});

// ===== PREVIEW ẢNH =====
const xemTruocAnh = (input) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('preview-image').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

const xemTruocAnhBienThe = (input) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = input.closest('.d-flex').querySelector('.variant-preview');
            if (img) img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

// Mark when a new image is selected for a variant
const danhDauAnhMoi = (input) => {
    const file = input.files[0];
    if (file) {
        // Preview the image
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = input.closest('.d-flex').querySelector('.variant-preview');
            if (img) img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        
        // Mark that this variant has a new image
        const hiddenField = input.closest('.d-flex').querySelector('.variant-has-new-image');
        if (hiddenField) hiddenField.value = '1';
    }
};

// ===== QUẢN LÝ BIẾN THỂ =====
let chiSoBienThe = 0;

const khoiTaoChiSoBienThe = (chiSoDau) => {
    chiSoBienThe = chiSoDau || 0;
};

const themBienThe = () => {
    const noMsg = document.getElementById('no-variant-msg');
    if (noMsg) noMsg.style.display = 'none';
    
    const laKhongSize = laSanPhamKhongSize();
    const container = document.getElementById('variants-container');
    const variantHtml = `
        <div class="variant-item border rounded p-3 mb-3" id="variant-${chiSoBienThe}">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold text-secondary">Biến thể #${chiSoBienThe + 1}</span>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="xoaBienThe(${chiSoBienThe})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <div class="row g-2">
                <div class="col-md-4">
                    <label class="form-label small">Màu sắc *</label>
                    <input type="text" class="form-control form-control-sm" name="bienthe_mausac" placeholder="VD: Đỏ, Xanh..." required>
                </div>
                <div class="col-md-4">
                    <label class="form-label small">Giá riêng (₫)</label>
                    <input type="number" class="form-control form-control-sm" name="bienthe_gia" min="0" placeholder="Để trống = giá gốc">
                </div>
                <div class="col-md-4">
                    <label class="form-label small">Giảm giá (%)</label>
                    <input type="number" class="form-control form-control-sm" name="bienthe_giamgia" min="0" max="100" value="0">
                </div>
                <div class="col-12">
                    <label class="form-label small">Ảnh biến thể</label>
                    <div class="d-flex align-items-center gap-2">
                        <img class="variant-preview rounded" src="/images/shopping.png" alt="Preview" style="width: 50px; height: 50px; object-fit: cover;">
                        <input type="hidden" name="bienthe_hinhanh_cu" value="">
                        <input class="variant-has-new-image" type="hidden" name="bienthe_has_new_image" value="0">
                        <input type="file" class="form-control form-control-sm" name="bienthe_hinhanh" accept="image/*" onchange="danhDauAnhMoi(this)">
                    </div>
                </div>
                <!-- Số lượng (cho sản phẩm không có size) -->
                <div class="col-12 variant-qty-section" style="display: ${laKhongSize ? 'block' : 'none'}">
                    <label class="form-label small">Số lượng *</label>
                    <input type="number" class="form-control form-control-sm variant-direct-qty" name="bienthe_soluong" min="0" value="0" readonly disabled>
                </div>
                <!-- Size (cho sản phẩm có size) -->
                <div class="col-12 variant-size-section" style="display: ${laKhongSize ? 'none' : 'block'}">
                    <label class="form-label small">Số lượng theo Size</label>
                    <div class="row g-2">
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">XS</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${chiSoBienThe}_size_XS" min="0" value="0" readonly disabled>
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">S</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${chiSoBienThe}_size_S" min="0" value="0" readonly disabled>
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">M</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${chiSoBienThe}_size_M" min="0" value="0" readonly disabled>
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">L</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${chiSoBienThe}_size_L" min="0" value="0" readonly disabled>
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">XL</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${chiSoBienThe}_size_XL" min="0" value="0" readonly disabled>
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">XXL</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${chiSoBienThe}_size_XXL" min="0" value="0" readonly disabled>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', variantHtml);
    chiSoBienThe++;
    capNhatTongTon();
};

const xoaBienThe = (chiSo) => {
    const el = document.getElementById('variant-' + chiSo);
    if (el) el.remove();
    
    const container = document.getElementById('variants-container');
    if (container && container.children.length === 0) {
        const noMsg = document.getElementById('no-variant-msg');
        if (noMsg) noMsg.style.display = 'block';
    }
    capNhatTongTon();
};

// ===== TÍNH TỔNG TỒN KHO =====
const capNhatTongTon = () => {
    const laKhongSize = laSanPhamKhongSize();
    let tong = 0;
    
    if (laKhongSize) {
        // Tính tổng từ số lượng chính (base)
        document.querySelectorAll('.base-direct-qty').forEach(input => {
            tong += parseInt(input.value) || 0;
        });
        
        // Tính tổng từ số lượng trực tiếp của biến thể
        document.querySelectorAll('.variant-direct-qty').forEach(input => {
            tong += parseInt(input.value) || 0;
        });
    } else {
        // Tính tổng từ size gốc
        document.querySelectorAll('.base-size-qty').forEach(input => {
            tong += parseInt(input.value) || 0;
        });
        
        // Tính tổng từ size của biến thể
        document.querySelectorAll('.variant-size-qty').forEach(input => {
            tong += parseInt(input.value) || 0;
        });
    }
    
    const tongSoLuongEl = document.getElementById('tongsoluong');
    const soLuongTonEl = document.getElementById('soluongton');
    
    if (tongSoLuongEl) {
        const fmt = window.App && typeof window.App.formatNumberVI === 'function'
            ? window.App.formatNumberVI
            : (n) => Number(n || 0).toLocaleString('vi-VN');
        tongSoLuongEl.textContent = fmt(tong);
    }
    if (soLuongTonEl) {
        soLuongTonEl.value = tong;
    }
};

// ===== KHỞI TẠO =====
document.addEventListener('DOMContentLoaded', () => {
    capNhatTongTon();

    // Shared auto-confirm for delete actions
    if (window.App && typeof window.App.installAutoDeleteConfirm === 'function') {
        window.App.installAutoDeleteConfirm({
            root: document.body,
            defaultMessage: 'Bạn có chắc muốn xóa sản phẩm này?'
        });
    }
});
