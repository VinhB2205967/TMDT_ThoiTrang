/**
 * Favorites - Client JavaScript
 * Xử lý yêu thích sản phẩm
 */

// ===== REMOVE PRODUCT ANIMATION =====
const animateRemoveCard = (card, callback) => {
    card.style.transition = 'all 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.8)';
    setTimeout(() => {
        card.remove();
        if (callback) callback();
    }, 300);
};

// ===== CHECK EMPTY FAVORITES =====
const checkEmptyFavorites = () => {
    if (document.querySelectorAll('.product-card').length === 0) {
        location.reload();
    }
};

// ===== REMOVE FROM FAVORITES =====
const removeFavorite = async (btn) => {
    const productId = btn.dataset.id;
    const card = btn.closest('.col-6');
    
    try {
        let data;
        if (window.App && window.App.apiFetch) {
            const r = await window.App.apiFetch(`/favorites/remove/${productId}`, { method: 'POST' });
            data = r.data;
        } else {
            const res = await fetch(`/favorites/remove/${productId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            data = await res.json();
        }
        
        if (data.success) {
            animateRemoveCard(card, checkEmptyFavorites);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Có lỗi xảy ra, vui lòng thử lại');
    }
};

// ===== INIT FAVORITE BUTTONS =====
const initFavoriteButtons = () => {
    document.querySelectorAll('.btn-remove-favorite').forEach(btn => {
        btn.addEventListener('click', function() {
            removeFavorite(this);
        });
    });
};

// ===== INITIALIZE ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', () => {
    initFavoriteButtons();
});

// ===== ADD TO CART FROM FAVORITES =====
const addToCartFromFavorites = (productId) => {
    // Redirect to product detail to select variant/size
    window.location.href = `/products/${productId}`;
};
