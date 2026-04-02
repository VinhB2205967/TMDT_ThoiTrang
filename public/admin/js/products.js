/**
 * Products Management - Admin JavaScript
 * Quản lý sản phẩm: thêm, sửa, biến thể, tồn kho
 */

const loaiKhongSize = ['tui', 'phukien'];

const laSanPhamKhongSize = () => {
    const chonLoai = document.getElementById('loaisanpham');
    if (!chonLoai) return false;
    return loaiKhongSize.includes(chonLoai.value);
};

const doiHienThiSize = () => {
    const laKhongSize = laSanPhamKhongSize();

    const baseSizeSection = document.getElementById('baseSizeSection');
    if (baseSizeSection) {
        baseSizeSection.style.display = laKhongSize ? 'none' : 'block';
    }

    const baseQtySection = document.getElementById('baseQtySection');
    if (baseQtySection) {
        baseQtySection.style.display = laKhongSize ? 'block' : 'none';
    }

    document.querySelectorAll('.variant-size-section').forEach((el) => {
        el.style.display = laKhongSize ? 'none' : 'block';
    });

    document.querySelectorAll('.variant-qty-section').forEach((el) => {
        el.style.display = laKhongSize ? 'block' : 'none';
    });

    capNhatTongTon();
};

window.xacNhanXoa = window.xacNhanXoa || ((thongBao = 'Bạn có chắc muốn xóa sản phẩm này?') => {
    return confirm(thongBao);
});

const xemTruocAnh = (input) => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const previewImage = document.getElementById('preview-image');
        if (previewImage) previewImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

const danhDauAnhMoi = (input) => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = input.closest('.d-flex')?.querySelector('.variant-preview');
        if (img) img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    const hiddenField = input.closest('.d-flex')?.querySelector('.variant-has-new-image');
    if (hiddenField) hiddenField.value = '1';
};

let chiSoBienThe = 0;

const khoiTaoChiSoBienThe = (chiSoDau) => {
    chiSoBienThe = chiSoDau || 0;
};

const themBienThe = () => {
    const noMsg = document.getElementById('no-variant-msg');
    if (noMsg) noMsg.style.display = 'none';

    const laKhongSize = laSanPhamKhongSize();
    const container = document.getElementById('variants-container');
    if (!container) return;

    const sizeInputs = ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((sizeCode) => `
        <div class="col-4 col-md-2">
            <label class="form-label small text-muted">${sizeCode}</label>
            <input type="number" class="form-control form-control-sm variant-size-qty" name="bienthe_${chiSoBienThe}_size_${sizeCode}" min="0" value="0" readonly disabled>
        </div>
    `).join('');

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
                <div class="col-12 variant-qty-section" style="display: ${laKhongSize ? 'block' : 'none'}">
                    <label class="form-label small">Số lượng *</label>
                    <input type="number" class="form-control form-control-sm variant-direct-qty" name="bienthe_soluong" min="0" value="0" readonly disabled>
                </div>
                <div class="col-12 variant-size-section" style="display: ${laKhongSize ? 'none' : 'block'}">
                    <label class="form-label small">Số lượng theo size</label>
                    <div class="row g-2">
                        ${sizeInputs}
                    </div>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', variantHtml);
    chiSoBienThe += 1;
    capNhatTongTon();
};

const xoaBienThe = (chiSo) => {
    const el = document.getElementById(`variant-${chiSo}`);
    if (el) el.remove();

    const container = document.getElementById('variants-container');
    if (container && container.children.length === 0) {
        const noMsg = document.getElementById('no-variant-msg');
        if (noMsg) noMsg.style.display = 'block';
    }

    capNhatTongTon();
};

const capNhatTongTon = () => {
    const laKhongSize = laSanPhamKhongSize();
    let tong = 0;

    if (laKhongSize) {
        document.querySelectorAll('.base-direct-qty').forEach((input) => {
            tong += parseInt(input.value, 10) || 0;
        });

        document.querySelectorAll('.variant-direct-qty').forEach((input) => {
            tong += parseInt(input.value, 10) || 0;
        });
    } else {
        document.querySelectorAll('.base-size-qty').forEach((input) => {
            tong += parseInt(input.value, 10) || 0;
        });

        document.querySelectorAll('.variant-size-qty').forEach((input) => {
            tong += parseInt(input.value, 10) || 0;
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

document.addEventListener('DOMContentLoaded', () => {
    capNhatTongTon();

    if (window.App && typeof window.App.installAutoDeleteConfirm === 'function') {
        window.App.installAutoDeleteConfirm({
            root: document.body,
            defaultMessage: 'Bạn có chắc muốn xóa sản phẩm này?'
        });
    }
});
