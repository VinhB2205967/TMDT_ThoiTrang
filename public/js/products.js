/**
 * Products - Client JavaScript
 * Xử lý bộ lọc sản phẩm
 */

// ===== DEBOUNCE HELPER =====
const chongDoi = (callback, delay) => {
    if (window.App && window.App.debounce) return window.App.debounce(callback, delay, 'products-filter');
    // fallback
    if (chongDoi.__t) clearTimeout(chongDoi.__t);
    chongDoi.__t = setTimeout(callback, delay);
};

// ===== AUTO SUBMIT FILTER =====
const khoiTaoLocTuDong = () => {
    const formLoc = document.querySelector('.filter-bar form');
    
    if (formLoc) {
        // Các select box tự động submit khi thay đổi
        const danhSachSelect = formLoc.querySelectorAll('select');
        danhSachSelect.forEach(oChon => {
            oChon.addEventListener('change', () => {
                formLoc.submit();
            });
        });

        // Input số (giá) - debounce rồi submit
        const oGia = formLoc.querySelectorAll('input[type="number"]');
        oGia.forEach(input => {
            input.addEventListener('input', () => {
                chongDoi(() => formLoc.submit(), 800);
            });
        });

        // Enter trong ô tìm kiếm
        const oTimKiem = formLoc.querySelector('input[name="keyword"]');
        if (oTimKiem) {
            oTimKiem.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    formLoc.submit();
                }
            });
        }
    }
};

// ===== INITIALIZE ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', () => {
    khoiTaoLocTuDong();
});

// ===== ADD TO CART (placeholder) =====
const themGio = (maSanPham) => {
    // Redirect to product detail page to select variant/size
    window.location.href = `/products/${maSanPham}`;
};

// ===== WISHLIST TOGGLE =====
const doiYeuThich = (nut, maSanPham) => {
    const bieuTuong = nut.querySelector('i');
    if (bieuTuong.classList.contains('bi-heart')) {
        bieuTuong.classList.remove('bi-heart');
        bieuTuong.classList.add('bi-heart-fill');
        nut.classList.add('active');
        // TODO: Call API to add to favorites
    } else {
        bieuTuong.classList.remove('bi-heart-fill');
        bieuTuong.classList.add('bi-heart');
        nut.classList.remove('active');
        // TODO: Call API to remove from favorites
    }
};

// ===== HANDLE ADD CART CLICK =====
const xuLyThemGio = (event) => {
    event.preventDefault();
    event.stopPropagation();
    // TODO: Show quick add modal or redirect to product detail
};

// ===== HANDLE WISHLIST CLICK =====
const xuLyYeuThich = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nut = event.currentTarget;
    doiYeuThich(nut);
};
