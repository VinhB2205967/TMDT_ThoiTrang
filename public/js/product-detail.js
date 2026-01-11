/**
 * Product Detail - Client JavaScript
 * Xử lý chọn biến thể, màu sắc, kích thước
 */

// ===== SELECT VARIANT =====
function selectVariant(idx, colorName, imgSrc) {
    // Update color name display
    document.getElementById('selectedColor').textContent = colorName;
    
    // Update main image
    if (imgSrc && imgSrc !== 'null' && imgSrc !== '/images/shopping.png') {
        document.getElementById('mainImage').src = imgSrc;
    }
    
    // Ẩn tất cả size panels
    document.querySelectorAll('.variant-size-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // Hiện size panel của biến thể được chọn
    const sizePanel = document.getElementById('sizePanel_' + idx);
    if (sizePanel) {
        sizePanel.style.display = 'flex';
        
        // Chọn size đầu tiên có hàng
        const firstSize = sizePanel.querySelector('input.size-input:not(:disabled)');
        if (firstSize) {
            firstSize.checked = true;
            document.getElementById('selectedSize').textContent = firstSize.value;
        } else {
            document.getElementById('selectedSize').textContent = '';
        }
    }
}

// ===== SELECT SIZE =====
function selectSize(sizeName) {
    document.getElementById('selectedSize').textContent = sizeName;
}

// ===== QUANTITY CONTROLS =====
function updateQuantity(delta) {
    const input = document.getElementById('quantity');
    if (!input) return;
    
    let value = parseInt(input.value) || 1;
    value = Math.max(1, value + delta);
    
    const max = parseInt(input.max) || 999;
    value = Math.min(value, max);
    
    input.value = value;
}

// ===== IMAGE ZOOM/GALLERY =====
function changeMainImage(imgSrc) {
    const mainImg = document.getElementById('mainImage');
    if (mainImg && imgSrc) {
        mainImg.src = imgSrc;
    }
}

// ===== ADD TO CART =====
function addToCart() {
    const selectedColor = document.getElementById('selectedColor')?.textContent;
    const selectedSize = document.getElementById('selectedSize')?.textContent;
    const quantity = document.getElementById('quantity')?.value || 1;
    
    if (!selectedColor || selectedColor === 'Chưa chọn') {
        alert('Vui lòng chọn màu sắc');
        return;
    }
    
    if (!selectedSize || selectedSize === 'Chưa chọn') {
        alert('Vui lòng chọn kích thước');
        return;
    }
    
    // TODO: Implement add to cart API call
    console.log('Add to cart:', { selectedColor, selectedSize, quantity });
}

// ===== INITIALIZE ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', function() {
    // Chọn size đầu tiên của biến thể đầu tiên
    const firstPanel = document.getElementById('sizePanel_0');
    if (firstPanel) {
        const firstSize = firstPanel.querySelector('input.size-input:not(:disabled)');
        if (firstSize) {
            firstSize.checked = true;
            const selectedSizeEl = document.getElementById('selectedSize');
            if (selectedSizeEl) {
                selectedSizeEl.textContent = firstSize.value;
            }
        }
    }
});
