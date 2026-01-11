/**
 * Products - Client JavaScript
 * Xử lý bộ lọc sản phẩm
 */

// ===== AUTO SUBMIT FILTER =====
document.addEventListener('DOMContentLoaded', function() {
    // Lấy form filter
    const filterForm = document.querySelector('.filter-bar form');
    
    if (filterForm) {
        // Các select box tự động submit khi thay đổi
        const selects = filterForm.querySelectorAll('select');
        selects.forEach(select => {
            select.addEventListener('change', function() {
                filterForm.submit();
            });
        });

        // Input số (giá) - debounce rồi submit
        const priceInputs = filterForm.querySelectorAll('input[type="number"]');
        let debounceTimer;
        priceInputs.forEach(input => {
            input.addEventListener('input', function() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    filterForm.submit();
                }, 800); // Đợi 800ms sau khi ngừng gõ
            });
        });

        // Enter trong ô tìm kiếm
        const searchInput = filterForm.querySelector('input[name="keyword"]');
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    filterForm.submit();
                }
            });
        }
    }
});

// ===== ADD TO CART (placeholder) =====
function addToCart(productId) {
    // Redirect to product detail page to select variant/size
    window.location.href = `/products/${productId}`;
}

// ===== WISHLIST TOGGLE =====
function toggleWishlist(btn, productId) {
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
}
