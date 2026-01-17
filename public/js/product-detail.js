/**
 * Product Detail - Client JavaScript
 * Xử lý chọn biến thể, màu sắc, kích thước và giới hạn số lượng.
 */

// Global state to hold variant and selection info
let currentVariantIndex = 0;
let currentSize = '';
let maxQuantity = 99; // Default max

// ===== HELPER FUNCTIONS =====
const formatPrice = (price) => {
    if (window.App && window.App.formatNumberVI) return window.App.formatNumberVI(price);
    return new Intl.NumberFormat('vi-VN').format(price);
};

// ===== DOM ELEMENT GETTERS (memoized for performance) =====
const getElement = (id) => {
    const element = document.getElementById(id);
    if (!element) console.warn(`Element with ID '${id}' not found.`);
    return element;
};
const memoizedGetters = {
    mainImage: () => getElement('mainImage'),
    qtyInput: () => getElement('qtyInput'),
    selectedColor: () => getElement('selectedColor'),
    selectedSize: () => getElement('selectedSize'),
    priceOld: () => getElement('priceOld'),
    priceDiscount: () => getElement('priceDiscount'),
    priceCurrent: () => getElement('priceCurrent'),
    sizeSection: () => getElement('sizeSection'),
    addToCartForm: () => getElement('addToCartForm'),
    plusBtn: () => document.querySelector('.qty-btn.plus'),
    minusBtn: () => document.querySelector('.qty-btn.minus')
};

// ===== UPDATE UI FUNCTIONS =====

/**
 * Cập nhật hiển thị giá dựa trên biến thể được chọn.
 */
const updatePriceDisplay = (gia, giaMoi, giamGia) => {
    const priceCurrent = memoizedGetters.priceCurrent();
    const priceOld = memoizedGetters.priceOld();
    const priceDiscount = memoizedGetters.priceDiscount();

    if (priceCurrent) priceCurrent.textContent = formatPrice(giaMoi) + 'đ';

    if (giamGia > 0) {
        if (priceOld) {
            priceOld.textContent = formatPrice(gia) + 'đ';
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
const updateQuantityButtons = () => {
    const input = memoizedGetters.qtyInput();
    const plusBtn = memoizedGetters.plusBtn();
    const minusBtn = memoizedGetters.minusBtn();
    if (!input || !plusBtn || !minusBtn) return;

    const currentValue = parseInt(input.value);
    plusBtn.disabled = currentValue >= maxQuantity;
    minusBtn.disabled = currentValue <= 1;
};

/**
 * Cập nhật thuộc tính `max` của input số lượng và reset giá trị nếu cần.
 */
const updateQuantityInputState = () => {
    const input = memoizedGetters.qtyInput();
    if (!input) return;

    const hasSizeSection = !!memoizedGetters.sizeSection();
    const variant = window.productVariants[currentVariantIndex];
    
    if (hasSizeSection) {
        // Sản phẩm có size, max quantity phụ thuộc vào size
        const sizeData = variant?.sizes?.find(s => s.size === currentSize);
        maxQuantity = sizeData?.soluong || 0;
    } else {
        // Sản phẩm không có size, max quantity là của biến thể
        maxQuantity = variant?.soluong || 0;
    }
    
    // Nếu không có hàng, đặt max là 0
    if(maxQuantity <= 0) {
        maxQuantity = 0;
    }

    input.max = maxQuantity;

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
    const addToCartBtn = document.querySelector('#addToCartForm button[type="submit"]');

    // Reset số lượng về 1 nếu vượt quá hoặc nếu không còn hàng
    let currentValue = parseInt(input.value);
    if (isNaN(currentValue)) currentValue = 1;

    if (maxQuantity === 0) {
        input.value = 0;
        input.disabled = true;
        
        stockMsg.textContent = 'Hết hàng';
        stockMsg.style.display = 'block';
        
        if (addToCartBtn) {
            addToCartBtn.disabled = true;
            if (!addToCartBtn.dataset.originalText) addToCartBtn.dataset.originalText = addToCartBtn.textContent;
            addToCartBtn.textContent = 'Hết hàng';
        }
    } else {
        input.disabled = false;
        
        stockMsg.style.display = 'none';
        
        if (addToCartBtn) {
            addToCartBtn.disabled = false;
            if (addToCartBtn.dataset.originalText) addToCartBtn.textContent = addToCartBtn.dataset.originalText;
        }

        if (currentValue > maxQuantity) {
            input.value = maxQuantity;
        } else if (currentValue < 1) {
            input.value = 1;
        }
    }

    updateQuantityButtons();
};


// ===== EVENT HANDLERS =====

/**
 * Cập nhật trạng thái hiển thị của các nút size (ẩn/hiện/disable) dựa trên tồn kho.
 */
const updateSizeOptionsState = (variantIdx) => {
    const variant = window.productVariants[variantIdx];
    if (!variant || !variant.sizes) return;

    const sizePanel = getElement(`sizePanel_${variantIdx}`);
    if (!sizePanel) return;

    const inputs = sizePanel.querySelectorAll('input.size-input');
    inputs.forEach(input => {
        const sizeVal = input.value;
        const sizeData = variant.sizes.find(s => s.size === sizeVal);
        const stock = sizeData ? sizeData.soluong : 0;
        
        // Tìm label tương ứng để thay đổi giao diện
        let label = input.nextElementSibling;
        if (!label || label.tagName !== 'LABEL') {
             if (input.id) label = sizePanel.querySelector(`label[for="${input.id}"]`);
        }

        if (stock <= 0) {
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
                label.title = `Còn ${stock} sản phẩm`;
            }
        }
    });
};

/**
 * Xử lý khi người dùng chọn một màu sắc (biến thể) mới.
 */
window.selectVariant = (idx, colorName, imgSrc, labelElement) => {
    currentVariantIndex = idx;
    
    // Update color name display
    const selectedColorEl = memoizedGetters.selectedColor();
    if (selectedColorEl) selectedColorEl.textContent = colorName;

    // Update main image
    const mainImageEl = memoizedGetters.mainImage();
    if (mainImageEl && imgSrc && imgSrc !== 'null' && imgSrc !== '/images/shopping.png') {
        mainImageEl.src = imgSrc;
    }

    // Update price from variant data attributes
    if (labelElement) {
        const gia = parseInt(labelElement.dataset.gia) || 0;
        const giaMoi = parseInt(labelElement.dataset.giamoi) || gia;
        const giamGia = parseInt(labelElement.dataset.giamgia) || 0;
        updatePriceDisplay(gia, giaMoi, giamGia);
    }
    
    // Chuyển đổi hiển thị giữa các panel size/stock
    document.querySelectorAll('.variant-size-panel, .variant-stock-panel').forEach(p => p.style.display = 'none');
    
    const sizePanel = getElement(`sizePanel_${idx}`);
    if (sizePanel) {
        sizePanel.style.display = 'flex';
        
        // Cập nhật giao diện các nút size (disable nếu hết hàng)
        updateSizeOptionsState(idx);

        // Tự động chọn size đầu tiên còn hàng
        const firstAvailableSize = sizePanel.querySelector('input.size-input:not(:disabled)');
        if (firstAvailableSize) {
            firstAvailableSize.checked = true;
            window.handleSizeSelect(firstAvailableSize.value); // Gọi handler để cập nhật state
        } else {
            window.handleSizeSelect(''); 
        }
    } else {
        // Nếu không có size panel, đây là sản phẩm không có size
        const stockPanel = getElement(`stockPanel_${idx}`);
        if(stockPanel) stockPanel.style.display = 'block';
        updateQuantityInputState(); // Cập nhật số lượng cho biến thể
    }
};

/**
 * Xử lý khi người dùng chọn một kích cỡ (size) mới.
 */
window.handleSizeSelect = (sizeName) => {
    currentSize = sizeName;
    const selectedSizeEl = memoizedGetters.selectedSize();
    if (selectedSizeEl) selectedSizeEl.textContent = sizeName;
    
    updateQuantityInputState();
};

/**
 * Xử lý khi người dùng chọn thumbnail ảnh.
 */
window.selectThumbnail = (imgSrc, element) => {
    // Update main image
    const mainImageEl = memoizedGetters.mainImage();
    if (mainImageEl && imgSrc) {
        mainImageEl.src = imgSrc;
    }

    // Update active class
    document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }
};

/**
 * Giảm số lượng.
 */
window.decreaseQty = () => {
    const input = memoizedGetters.qtyInput();
    if (!input) return;
    
    let newValue = parseInt(input.value) - 1;
    if (newValue >= 1) {
        input.value = newValue;
    }
    updateQuantityButtons();
};

/**
 * Tăng số lượng, kiểm tra không vượt quá max.
 */
window.increaseQty = () => {
    const input = memoizedGetters.qtyInput();
    if (!input) return;
    
    let currentValue = parseInt(input.value) || 0;
    if (currentValue < maxQuantity) {
        input.value = currentValue + 1;
    } else {
        input.value = maxQuantity;
    }
    updateQuantityButtons();
};

/**
 * Xử lý sự kiện 'input' trên trường số lượng để đảm bảo giá trị hợp lệ.
 */
const handleQuantityInputChange = (event) => {
    const input = event.target;
    let value = parseInt(input.value);

    if (isNaN(value) || value < 1) {
        value = 1;
    }
    
    if (value > maxQuantity) {
        value = maxQuantity;
    }
    
    if (maxQuantity === 0) {
        value = 0;
    }

    if (input.value != value) {
        input.value = value;
    }
    updateQuantityButtons();
};


// ===== INITIALIZATION =====

/**
 * Khởi tạo trạng thái ban đầu khi trang tải xong.
 */
const initializeProductDetail = () => {
    // Kiểm tra xem `productVariants` có tồn tại không
    if (typeof window.productVariants === 'undefined' || window.productVariants.length === 0) {
        console.error("Product variants data is not available.");
        // Có thể vô hiệu hóa toàn bộ form nếu không có data
        const form = memoizedGetters.addToCartForm();
        if(form) form.style.opacity = '0.5'; form.style.pointerEvents = 'none';
        return;
    }

    const hasSizeSection = !!memoizedGetters.sizeSection();

    // Thiết lập variant index ban đầu
    currentVariantIndex = 0;
    const initialVariantRadio = document.querySelector('input[name="bienthe_id"]:checked');
    if (initialVariantRadio) {
        currentVariantIndex = parseInt(initialVariantRadio.dataset.variantIdx) || 0;
    }
    
    // Thiết lập size ban đầu (nếu có)
    if (hasSizeSection) {
        // Cập nhật trạng thái các nút size trước khi chọn
        updateSizeOptionsState(currentVariantIndex);

        const initialSizeRadio = document.querySelector(`#sizePanel_${currentVariantIndex} input[name="kichco"]:checked`);
        if (initialSizeRadio) {
            currentSize = initialSizeRadio.value;
        } else {
            // Nếu không có size nào được check, chọn size đầu tiên còn hàng
            const firstAvailableSize = document.querySelector(`#sizePanel_${currentVariantIndex} input.size-input:not(:disabled)`);
             if (firstAvailableSize) {
                firstAvailableSize.checked = true;
                currentSize = firstAvailableSize.value;
            }
        }
        const selectedSizeEl = memoizedGetters.selectedSize();
        if (selectedSizeEl) selectedSizeEl.textContent = currentSize;
    }
    
    // Cập nhật trạng thái input số lượng và các nút
    updateQuantityInputState();
    
    // Gắn event listener cho input số lượng
    const qtyInput = memoizedGetters.qtyInput();
    if (qtyInput) {
        qtyInput.addEventListener('input', handleQuantityInputChange);
    }

    // Hiển thị panel size/stock cho variant ban đầu
    const initialSizePanel = getElement(`sizePanel_${currentVariantIndex}`);
    const initialStockPanel = getElement(`stockPanel_${currentVariantIndex}`);
    if(initialSizePanel) initialSizePanel.style.display = 'flex';
    if(initialStockPanel) initialStockPanel.style.display = 'block';

};

document.addEventListener('DOMContentLoaded', initializeProductDetail);