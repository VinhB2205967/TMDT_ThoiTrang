/**
 * Favorites - Client JavaScript
 * Xử lý yêu thích sản phẩm
 */

// ===== REMOVE PRODUCT ANIMATION =====
const hieuUngXoaThe = (the, callback) => {
    the.style.transition = 'all 0.3s ease';
    the.style.opacity = '0';
    the.style.transform = 'scale(0.8)';
    setTimeout(() => {
        the.remove();
        if (callback) callback();
    }, 300);
};

// ===== CHECK EMPTY FAVORITES =====
const kiemTraTrongYeuThich = () => {
    if (document.querySelectorAll('.product-card').length === 0) {
        location.reload();
    }
};

// ===== REMOVE FROM FAVORITES =====
const xoaYeuThich = async (nut) => {
    const maSanPham = nut.dataset.id;
    const the = nut.closest('.col-6');
    
    try {
        let duLieu;
        if (window.App && window.App.apiFetch) {
            const r = await window.App.apiFetch(`/favorites/remove/${maSanPham}`, { method: 'POST' });
            duLieu = r.data;
        } else {
            const res = await fetch(`/favorites/remove/${maSanPham}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            duLieu = await res.json();
        }
        
        if (duLieu.success) {
            hieuUngXoaThe(the, kiemTraTrongYeuThich);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Có lỗi xảy ra, vui lòng thử lại');
    }
};

// ===== INIT FAVORITE BUTTONS =====
const khoiTaoNutYeuThich = () => {
    document.querySelectorAll('.btn-remove-favorite').forEach(nut => {
        nut.addEventListener('click', function() {
            xoaYeuThich(this);
        });
    });
};

// ===== INITIALIZE ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', () => {
    khoiTaoNutYeuThich();
});

// ===== ADD TO CART FROM FAVORITES =====
const themGioTuYeuThich = (maSanPham) => {
    // Redirect to product detail to select variant/size
    window.location.href = `/products/${maSanPham}`;
};
