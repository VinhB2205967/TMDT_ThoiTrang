/**
 * Favorites - Client JavaScript
 * Xử lý yêu thích sản phẩm
 */

document.addEventListener('DOMContentLoaded', function() {
    // Xử lý xóa khỏi yêu thích
    document.querySelectorAll('.btn-remove-favorite').forEach(btn => {
        btn.addEventListener('click', async function() {
            const productId = this.dataset.id;
            const card = this.closest('.col-6');
            
            try {
                const res = await fetch(`/favorites/remove/${productId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                
                if (data.success) {
                    card.style.transition = 'all 0.3s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => {
                        card.remove();
                        // Kiểm tra nếu không còn sản phẩm nào
                        if (document.querySelectorAll('.product-card').length === 0) {
                            location.reload();
                        }
                    }, 300);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Có lỗi xảy ra, vui lòng thử lại');
            }
        });
    });
});

// ===== ADD TO CART FROM FAVORITES =====
function addToCartFromFavorites(productId) {
    // Redirect to product detail to select variant/size
    window.location.href = `/products/${productId}`;
}
