/**
 * Product Detail - Client JavaScript
 * Xử lý chọn biến thể, màu sắc, kích thước và giới hạn số lượng.
 */

// Global state to hold variant and selection info
let chiSoBienTheHienTai = 0;
let kichCoHienTai = '';
let soLuongToiDa = 99; // Default max

const goiApi = (window.App && window.App.apiFetch)
    ? window.App.apiFetch
    : async (url, options = {}) => {
        const res = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json', ...(options.headers || {}) },
            ...options
        });
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        return { ok: res.ok, status: res.status, data };
    };

const capNhatBadgeGio = (count) => {
    if (window.App && typeof window.App.setCartBadge === 'function') {
        window.App.setCartBadge(count);
        return;
    }
    const badge = document.querySelector('a[href="/cart"] .badge-counter') || document.querySelector('.cart-badge');
    if (badge) badge.textContent = String(count || 0);
};

// ===== HELPER FUNCTIONS =====
const dinhDangGia = (gia) => {
    if (window.App && window.App.formatNumberVI) return window.App.formatNumberVI(gia);
    return new Intl.NumberFormat('vi-VN').format(gia);
};

// ===== DOM ELEMENT GETTERS (memoized for performance) =====
const layPhanTu = (id) => {
    const phanTu = document.getElementById(id);
    if (!phanTu) console.warn(`Element with ID '${id}' not found.`);
    return phanTu;
};
const boLayNhanh = {
    mainImage: () => layPhanTu('mainImage'),
    qtyInput: () => layPhanTu('qtyInput'),
    selectedColor: () => layPhanTu('selectedColor'),
    selectedSize: () => layPhanTu('selectedSize'),
    priceOld: () => layPhanTu('priceOld'),
    priceDiscount: () => layPhanTu('priceDiscount'),
    priceCurrent: () => layPhanTu('priceCurrent'),
    sizeSection: () => layPhanTu('sizeSection'),
    addToCartForm: () => layPhanTu('addToCartForm'),
    plusBtn: () => document.querySelector('.qty-btn.plus'),
    minusBtn: () => document.querySelector('.qty-btn.minus')
};

// ===== UPDATE UI FUNCTIONS =====

/**
 * Cập nhật hiển thị giá dựa trên biến thể được chọn.
 */
const capNhatHienThiGia = (gia, giaMoi, giamGia) => {
    const priceCurrent = boLayNhanh.priceCurrent();
    const priceOld = boLayNhanh.priceOld();
    const priceDiscount = boLayNhanh.priceDiscount();

    if (priceCurrent) priceCurrent.textContent = dinhDangGia(giaMoi) + 'đ';

    if (giamGia > 0) {
        if (priceOld) {
            priceOld.textContent = dinhDangGia(gia) + 'đ';
            priceOld.style.display = '';
        }
        if (priceDiscount) {
            priceDiscount.textContent = `-${giamGia}%`;
            priceDiscount.style.display = '';
        }
    } else {
        if (priceOld) priceOld.style.display = 'none';
        if (priceDiscount) priceDiscount.style.display = 'none';
    }
};

/**
 * Cập nhật trạng thái (enabled/disabled) của nút tăng/giảm số lượng.
 */
const capNhatNutSoLuong = () => {
    const input = boLayNhanh.qtyInput();
    const plusBtn = boLayNhanh.plusBtn();
    const minusBtn = boLayNhanh.minusBtn();
    if (!input || !plusBtn || !minusBtn) return;

    const giaTriHienTai = parseInt(input.value);
    plusBtn.disabled = giaTriHienTai >= soLuongToiDa;
    minusBtn.disabled = giaTriHienTai <= 1;
};

/**
 * Cập nhật thuộc tính `max` của input số lượng và reset giá trị nếu cần.
 */
const capNhatTrangThaiSoLuong = () => {
    const input = boLayNhanh.qtyInput();
    if (!input) return;

    const coPhanSize = !!boLayNhanh.sizeSection();
    const bienThe = window.productVariants[chiSoBienTheHienTai];
    
    if (coPhanSize) {
        // Sản phẩm có size, max quantity phụ thuộc vào size
        const duLieuSize = bienThe?.sizes?.find(s => s.size === kichCoHienTai);
        soLuongToiDa = duLieuSize?.soluong || 0;
    } else {
        // Sản phẩm không có size, max quantity là của biến thể
        soLuongToiDa = bienThe?.soluong || 0;
    }
    
    // Nếu không có hàng, đặt max là 0
    if(soLuongToiDa <= 0) {
        soLuongToiDa = 0;
    }

    input.max = soLuongToiDa;

    // Tìm hoặc tạo element hiển thị thông báo hết hàng
    let stockMsg = document.getElementById('stock-message');
    if (!stockMsg) {
        stockMsg = document.createElement('div');
        stockMsg.id = 'stock-message';
        stockMsg.className = 'alert alert-danger mt-2 py-1 px-2 small fw-bold text-center';
        if (input.parentElement) {
            input.parentElement.insertAdjacentElement('afterend', stockMsg);
        }
    }

    // Nút thêm giỏ hàng
    const nutThemGio = document.querySelector('#addToCartForm button[type="submit"]');

    // Reset số lượng về 1 nếu vượt quá hoặc nếu không còn hàng
    let giaTriHienTai = parseInt(input.value);
    if (isNaN(giaTriHienTai)) giaTriHienTai = 1;

    if (soLuongToiDa === 0) {
        input.value = 0;
        input.disabled = true;
        
        stockMsg.textContent = 'Hết hàng';
        stockMsg.style.display = 'block';
        
        if (nutThemGio) {
            nutThemGio.disabled = true;
            if (!nutThemGio.dataset.originalText) nutThemGio.dataset.originalText = nutThemGio.textContent;
            nutThemGio.textContent = 'Hết hàng';
        }
    } else {
        input.disabled = false;
        
        stockMsg.style.display = 'none';
        
        if (nutThemGio) {
            nutThemGio.disabled = false;
            if (nutThemGio.dataset.originalText) nutThemGio.textContent = nutThemGio.dataset.originalText;
        }

        if (giaTriHienTai > soLuongToiDa) {
            input.value = soLuongToiDa;
        } else if (giaTriHienTai < 1) {
            input.value = 1;
        }
    }

    capNhatNutSoLuong();
};


// ===== EVENT HANDLERS =====

/**
 * Cập nhật trạng thái hiển thị của các nút size (ẩn/hiện/disable) dựa trên tồn kho.
 */
const capNhatTrangThaiSize = (chiSoBienThe) => {
    const bienThe = window.productVariants[chiSoBienThe];
    if (!bienThe || !bienThe.sizes) return;

    const sizePanel = layPhanTu(`sizePanel_${chiSoBienThe}`);
    if (!sizePanel) return;

    const inputs = sizePanel.querySelectorAll('input.size-input');
    inputs.forEach(input => {
        const giaTriSize = input.value;
        const duLieuSize = bienThe.sizes.find(s => s.size === giaTriSize);
        const tonKho = duLieuSize ? duLieuSize.soluong : 0;
        
        // Tìm label tương ứng để thay đổi giao diện
        let label = input.nextElementSibling;
        if (!label || label.tagName !== 'LABEL') {
             if (input.id) label = sizePanel.querySelector(`label[for="${input.id}"]`);
        }

        if (tonKho <= 0) {
            input.disabled = true;
            if (label) {
                label.classList.add('disabled', 'opacity-50');
                label.style.textDecoration = 'line-through'; // Gạch chéo chữ
                label.title = 'Hết hàng';
            }
        } else {
            input.disabled = false;
            if (label) {
                label.classList.remove('disabled', 'opacity-50');
                label.style.textDecoration = 'none';
                label.title = `Còn ${tonKho} sản phẩm`;
            }
        }
    });
};

/**
 * Xử lý khi người dùng chọn một màu sắc (biến thể) mới.
 */
window.chonBienThe = (idx, tenMau, anh, labelElement) => {
    chiSoBienTheHienTai = idx;
    
    // Update color name display
    const selectedColorEl = boLayNhanh.selectedColor();
    if (selectedColorEl) selectedColorEl.textContent = tenMau;

    // Update main image
    const mainImageEl = boLayNhanh.mainImage();
    if (mainImageEl && anh && anh !== 'null' && anh !== '/images/shopping.png') {
        mainImageEl.src = anh;
    }

    // Update price from variant data attributes
    if (labelElement) {
        const gia = parseInt(labelElement.dataset.gia) || 0;
        const giaMoi = parseInt(labelElement.dataset.giamoi) || gia;
        const giamGia = parseInt(labelElement.dataset.giamgia) || 0;
        capNhatHienThiGia(gia, giaMoi, giamGia);
    }
    
    // Chuyển đổi hiển thị giữa các panel size/stock
    document.querySelectorAll('.variant-size-panel, .variant-stock-panel').forEach(p => p.style.display = 'none');
    
    const sizePanel = layPhanTu(`sizePanel_${idx}`);
    if (sizePanel) {
        sizePanel.style.display = 'flex';
        
        // Cập nhật giao diện các nút size (disable nếu hết hàng)
        capNhatTrangThaiSize(idx);

        // Tự động chọn size đầu tiên còn hàng
        const sizeConHangDau = sizePanel.querySelector('input.size-input:not(:disabled)');
        if (sizeConHangDau) {
            sizeConHangDau.checked = true;
            window.chonSize(sizeConHangDau.value); // Gọi handler để cập nhật state
        } else {
            window.chonSize(''); 
        }
    } else {
        // Nếu không có size panel, đây là sản phẩm không có size
        const stockPanel = layPhanTu(`stockPanel_${idx}`);
        if(stockPanel) stockPanel.style.display = 'block';
        capNhatTrangThaiSoLuong(); // Cập nhật số lượng cho biến thể
    }
};

/**
 * Xử lý khi người dùng chọn một kích cỡ (size) mới.
 */
window.chonSize = (tenSize) => {
    kichCoHienTai = tenSize;
    const selectedSizeEl = boLayNhanh.selectedSize();
    if (selectedSizeEl) selectedSizeEl.textContent = tenSize;
    
    capNhatTrangThaiSoLuong();
};

/**
 * Xử lý khi người dùng chọn thumbnail ảnh.
 */
window.chonAnhNho = (anh, phanTu) => {
    // Update main image
    const mainImageEl = boLayNhanh.mainImage();
    if (mainImageEl && anh) {
        mainImageEl.src = anh;
    }

    // Update active class
    document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
    if (phanTu) {
        phanTu.classList.add('active');
    }
};

/**
 * Giảm số lượng.
 */
window.giamSoLuong = () => {
    const input = boLayNhanh.qtyInput();
    if (!input) return;
    
    let giaTriMoi = parseInt(input.value) - 1;
    if (giaTriMoi >= 1) {
        input.value = giaTriMoi;
    }
    capNhatNutSoLuong();
};

/**
 * Tăng số lượng, kiểm tra không vượt quá max.
 */
window.tangSoLuong = () => {
    const input = boLayNhanh.qtyInput();
    if (!input) return;
    
    let giaTriHienTai = parseInt(input.value) || 0;
    if (giaTriHienTai < soLuongToiDa) {
        input.value = giaTriHienTai + 1;
    } else {
        input.value = soLuongToiDa;
    }
    capNhatNutSoLuong();
};

/**
 * Xử lý sự kiện 'input' trên trường số lượng để đảm bảo giá trị hợp lệ.
 */
const xuLyNhapSoLuong = (event) => {
    const input = event.target;
    let giaTri = parseInt(input.value);

    if (isNaN(giaTri) || giaTri < 1) {
        giaTri = 1;
    }
    
    if (giaTri > soLuongToiDa) {
        giaTri = soLuongToiDa;
    }
    
    if (soLuongToiDa === 0) {
        giaTri = 0;
    }

    if (input.value != giaTri) {
        input.value = giaTri;
    }
    capNhatNutSoLuong();
};

function ganSubmitThemGioAjax() {
    const addForm = boLayNhanh.addToCartForm();
    if (!addForm || addForm.dataset.ajaxBound === '1') return;
    addForm.dataset.ajaxBound = '1';

    addForm.addEventListener('submit', async (event) => {
        const submitter = event.submitter || document.activeElement;
        const formAction = String(
            (submitter && submitter.getAttribute && submitter.getAttribute('formaction'))
            || addForm.getAttribute('action')
            || '/cart/add'
        );

        if (!formAction.includes('/cart/add')) {
            return;
        }

        event.preventDefault();

        const formData = new FormData(addForm);
        const payload = {
            sanpham_id: String(formData.get('sanpham_id') || '').trim(),
            bienthe_id: String(formData.get('bienthe_id') || '').trim() || null,
            kichco: String(formData.get('kichco') || '').trim() || null,
            soluong: Math.max(1, parseInt(String(formData.get('soluong') || '1'), 10) || 1)
        };

        const { ok, data } = await goiApi('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!ok || !data || !data.success) {
            window.alert((data && data.message) ? data.message : 'Không thể thêm vào giỏ hàng');
            return;
        }

        if (typeof data.cartCount === 'number') {
            capNhatBadgeGio(data.cartCount);
        }

        if (window.App && typeof window.App.flyToCart === 'function') {
            const img = boLayNhanh.mainImage();
            if (img) window.App.flyToCart(img);
        }
    });
}


// ===== INITIALIZATION =====

/**
 * Khởi tạo trạng thái ban đầu khi trang tải xong.
 */
const khoiTaoTrangChiTiet = () => {
    ganSubmitThemGioAjax();

    // Kiểm tra xem `productVariants` có tồn tại không
    if (typeof window.productVariants === 'undefined' || window.productVariants.length === 0) {
        console.error("Product variants data is not available.");
        // Có thể vô hiệu hóa toàn bộ form nếu không có data
        const form = boLayNhanh.addToCartForm();
        if (form) {
            form.style.opacity = '0.5';
            form.style.pointerEvents = 'none';
        }
        return;
    }

    const coPhanSize = !!boLayNhanh.sizeSection();

    // Thiết lập variant index ban đầu
    chiSoBienTheHienTai = 0;
    const initialVariantRadio = document.querySelector('input[name="bienthe_id"]:checked');
    if (initialVariantRadio) {
        chiSoBienTheHienTai = parseInt(initialVariantRadio.dataset.variantIdx) || 0;
    }
    
    // Thiết lập size ban đầu (nếu có)
    if (coPhanSize) {
        // Cập nhật trạng thái các nút size trước khi chọn
        capNhatTrangThaiSize(chiSoBienTheHienTai);

        const initialSizeRadio = document.querySelector(`#sizePanel_${chiSoBienTheHienTai} input[name="kichco"]:checked`);
        if (initialSizeRadio) {
            kichCoHienTai = initialSizeRadio.value;
        } else {
            // Nếu không có size nào được check, chọn size đầu tiên còn hàng
            const sizeConHangDau = document.querySelector(`#sizePanel_${chiSoBienTheHienTai} input.size-input:not(:disabled)`);
             if (sizeConHangDau) {
                sizeConHangDau.checked = true;
                kichCoHienTai = sizeConHangDau.value;
            }
        }
        const selectedSizeEl = boLayNhanh.selectedSize();
        if (selectedSizeEl) selectedSizeEl.textContent = kichCoHienTai;
    }
    
    // Cập nhật trạng thái input số lượng và các nút
    capNhatTrangThaiSoLuong();
    
    // Gắn event listener cho input số lượng
    const qtyInput = boLayNhanh.qtyInput();
    if (qtyInput) {
        qtyInput.addEventListener('input', xuLyNhapSoLuong);
    }

    // Hiển thị panel size/stock cho variant ban đầu
    const initialSizePanel = layPhanTu(`sizePanel_${chiSoBienTheHienTai}`);
    const initialStockPanel = layPhanTu(`stockPanel_${chiSoBienTheHienTai}`);
    if(initialSizePanel) initialSizePanel.style.display = 'flex';
    if(initialStockPanel) initialStockPanel.style.display = 'block';

};

document.addEventListener('DOMContentLoaded', khoiTaoTrangChiTiet);