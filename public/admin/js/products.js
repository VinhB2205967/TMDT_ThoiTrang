/**
 * Products Management - Admin JavaScript
 * Quản lý sản phẩm: thêm, sửa, biến thể, tồn kho
 */

// ===== LOẠI SẢN PHẨM KHÔNG CẦN SIZE =====
const noSizeProductTypes = ['tui', 'phukien'];

// ===== CHECK IF CURRENT PRODUCT NEEDS SIZE =====
const isNoSizeProduct = () => {
    const loaiSelect = document.getElementById('loaisanpham');
    if (!loaiSelect) return false;
    return noSizeProductTypes.includes(loaiSelect.value);
};

// ===== TOGGLE SIZE FIELDS =====
const toggleSizeFields = () => {
    const isNoSize = isNoSizeProduct();
    
    // Toggle base size section
    const baseSizeSection = document.getElementById('baseSizeSection');
    if (baseSizeSection) {
        baseSizeSection.style.display = isNoSize ? 'none' : 'block';
    }
    
    // Toggle base quantity section (cho sản phẩm không có size)
    const baseQtySection = document.getElementById('baseQtySection');
    if (baseQtySection) {
        baseQtySection.style.display = isNoSize ? 'block' : 'none';
    }
    
    // Toggle size fields in all variants
    document.querySelectorAll('.variant-size-section').forEach(el => {
        el.style.display = isNoSize ? 'none' : 'block';
    });
    
    // Toggle quantity field in all variants
    document.querySelectorAll('.variant-qty-section').forEach(el => {
        el.style.display = isNoSize ? 'block' : 'none';
    });
    
    // Update total stock
    updateTotalStock();
};

// ===== CONFIRM DELETE =====
window.confirmDelete = (message = 'Bạn có chắc muốn xóa sản phẩm này?') => {
    return confirm(message);
};

// ===== PREVIEW ẢNH =====
const previewFile = (input) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('preview-image').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

const previewVariantImage = (input) => {
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
const markNewImage = (input) => {
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
let variantIndex = 0;

const initVariantIndex = (initialIndex) => {
    variantIndex = initialIndex || 0;
};

const addVariant = () => {
    const noMsg = document.getElementById('no-variant-msg');
    if (noMsg) noMsg.style.display = 'none';
    
    const isNoSize = isNoSizeProduct();
    const container = document.getElementById('variants-container');
    const variantHtml = `
        <div class="variant-item border rounded p-3 mb-3" id="variant-${variantIndex}">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold text-secondary">Biến thể #${variantIndex + 1}</span>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeVariant(${variantIndex})">
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
                        <input type="file" class="form-control form-control-sm" name="bienthe_hinhanh" accept="image/*" onchange="markNewImage(this)">
                    </div>
                </div>
                <!-- Số lượng (cho sản phẩm không có size) -->
                <div class="col-12 variant-qty-section" style="display: ${isNoSize ? 'block' : 'none'}">
                    <label class="form-label small">Số lượng *</label>
                    <input type="number" class="form-control form-control-sm variant-direct-qty" name="bienthe_soluong" min="0" value="0" oninput="updateTotalStock()">
                </div>
                <!-- Size (cho sản phẩm có size) -->
                <div class="col-12 variant-size-section" style="display: ${isNoSize ? 'none' : 'block'}">
                    <label class="form-label small">Số lượng theo Size</label>
                    <div class="row g-2">
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">XS</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${variantIndex}_size_XS" min="0" value="0" oninput="updateTotalStock()">
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">S</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${variantIndex}_size_S" min="0" value="0" oninput="updateTotalStock()">
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">M</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${variantIndex}_size_M" min="0" value="0" oninput="updateTotalStock()">
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">L</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${variantIndex}_size_L" min="0" value="0" oninput="updateTotalStock()">
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">XL</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${variantIndex}_size_XL" min="0" value="0" oninput="updateTotalStock()">
                        </div>
                        <div class="col-4 col-md-2">
                            <label class="form-label small text-muted">XXL</label>
                            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${variantIndex}_size_XXL" min="0" value="0" oninput="updateTotalStock()">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', variantHtml);
    variantIndex++;
    updateTotalStock();
};

const removeVariant = (index) => {
    const el = document.getElementById('variant-' + index);
    if (el) el.remove();
    
    const container = document.getElementById('variants-container');
    if (container && container.children.length === 0) {
        const noMsg = document.getElementById('no-variant-msg');
        if (noMsg) noMsg.style.display = 'block';
    }
    updateTotalStock();
};

// ===== TÍNH TỔNG TỒN KHO =====
const updateTotalStock = () => {
    const isNoSize = isNoSizeProduct();
    let total = 0;
    
    if (isNoSize) {
        // Tính tổng từ số lượng chính (base)
        document.querySelectorAll('.base-direct-qty').forEach(input => {
            total += parseInt(input.value) || 0;
        });
        
        // Tính tổng từ số lượng trực tiếp của biến thể
        document.querySelectorAll('.variant-direct-qty').forEach(input => {
            total += parseInt(input.value) || 0;
        });
    } else {
        // Tính tổng từ size gốc
        document.querySelectorAll('.base-size-qty').forEach(input => {
            total += parseInt(input.value) || 0;
        });
        
        // Tính tổng từ size của biến thể
        document.querySelectorAll('.variant-size-qty').forEach(input => {
            total += parseInt(input.value) || 0;
        });
    }
    
    const tongSoLuongEl = document.getElementById('tongsoluong');
    const soLuongTonEl = document.getElementById('soluongton');
    
    if (tongSoLuongEl) {
        tongSoLuongEl.textContent = total.toLocaleString('vi-VN');
    }
    if (soLuongTonEl) {
        soLuongTonEl.value = total;
    }
};

// ===== KHỞI TẠO =====
document.addEventListener('DOMContentLoaded', () => {
    updateTotalStock();

    // Tự động bắt sự kiện click vào nút xóa (hỗ trợ cả thẻ a và form)
    document.body.addEventListener('click', (e) => {
        // 1. Trường hợp thẻ <a> chứa link delete
        const deleteLink = e.target.closest('a[href*="delete"]');
        if (deleteLink) {
            // Nếu thẻ a đã có onclick gọi confirmDelete thì bỏ qua để tránh hiện popup 2 lần
            if (deleteLink.getAttribute('onclick') && deleteLink.getAttribute('onclick').includes('confirmDelete')) {
                return;
            }

            if (!window.confirmDelete()) {
                e.preventDefault(); // Ngăn không cho chuyển trang nếu chọn Cancel
            }
            return;
        }

        // 2. Trường hợp button trong form delete
        const deleteBtn = e.target.closest('button');
        if (deleteBtn && deleteBtn.form && deleteBtn.form.action.includes('delete')) {
            if (!window.confirmDelete()) {
                e.preventDefault();
            }
        }
    });
});
