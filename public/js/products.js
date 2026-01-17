/**
 * Products - Client JavaScript
 * Xử lý bộ lọc sản phẩm
 */

// ===== DEBOUNCE HELPER =====
const debounce = (callback, delay) => {
    if (window.App && window.App.debounce) return window.App.debounce(callback, delay, 'products-filter');
    // fallback
    if (debounce.__t) clearTimeout(debounce.__t);
    debounce.__t = setTimeout(callback, delay);
};

// ===== AUTO SUBMIT FILTER =====
const initFilterAutoSubmit = () => {
    const filterForm = document.querySelector('.filter-bar form');
    
    if (filterForm) {
        // Các select box tự động submit khi thay đổi
        const selects = filterForm.querySelectorAll('select');
        selects.forEach(select => {
            select.addEventListener('change', () => {
                filterForm.submit();
            });
        });

        // Input số (giá) - debounce rồi submit
        const priceInputs = filterForm.querySelectorAll('input[type="number"]');
        priceInputs.forEach(input => {
            input.addEventListener('input', () => {
                debounce(() => filterForm.submit(), 800);
            });
        });

        // Enter trong ô tìm kiếm
        const searchInput = filterForm.querySelector('input[name="keyword"]');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    filterForm.submit();
                }
            });
        }
    }
};

// ===== INITIALIZE ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', () => {
    initFilterAutoSubmit();
});

// ===== ADD TO CART (placeholder) =====
const addToCart = (productId) => {
    // Redirect to product detail page to select variant/size
    window.location.href = `/products/${productId}`;
};

// ===== WISHLIST TOGGLE =====
const toggleWishlist = (btn, productId) => {
    const icon = btn.querySelector('i');
    if (icon.classList.contains('bi-heart')) {
        icon.classList.remove('bi-heart');
        icon.classList.add('bi-heart-fill');
        btn.classList.add('active');
        // TODO: Call API to add to favorites
    } else {
        icon.classList.remove('bi-heart-fill');
        icon.classList.add('bi-heart');
        btn.classList.remove('active');
        // TODO: Call API to remove from favorites
    }
};

// ===== HANDLE ADD CART CLICK =====
const handleAddCartClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    // TODO: Show quick add modal or redirect to product detail
};

// ===== HANDLE WISHLIST CLICK =====
const handleWishlistClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    toggleWishlist(btn);
};
