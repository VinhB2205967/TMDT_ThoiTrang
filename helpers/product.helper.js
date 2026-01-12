const colorMap = {
    'đỏ': '#e74c3c', 'do': '#e74c3c', 'red': '#e74c3c',
    'xanh': '#3498db', 'xanh dương': '#3498db', 'blue': '#3498db',
    'xanh lá': '#2ecc71', 'xanh la': '#2ecc71', 'green': '#2ecc71',
    'vàng': '#f1c40f', 'vang': '#f1c40f', 'yellow': '#f1c40f',
    'đen': '#2c3e50', 'den': '#2c3e50', 'black': '#2c3e50',
    'trắng': '#ecf0f1', 'trang': '#ecf0f1', 'white': '#ecf0f1',
    'hồng': '#e91e63', 'hong': '#e91e63', 'pink': '#e91e63',
    'tím': '#9b59b6', 'tim': '#9b59b6', 'purple': '#9b59b6',
    'cam': '#e67e22', 'orange': '#e67e22',
    'nâu': '#795548', 'nau': '#795548', 'brown': '#795548',
    'xám': '#95a5a6', 'xam': '#95a5a6', 'gray': '#95a5a6', 'grey': '#95a5a6',
    'be': '#d4a574', 'beige': '#d4a574',
    'kem': '#fffdd0',
    'navy': '#1a237e', 'xanh navy': '#1a237e'
};

const getColorCode = (colorName) => {
    if (!colorName) return '#ccc';
    const lowerColor = colorName.toLowerCase().trim();
    return colorMap[lowerColor] || colorName; 
};

const normalizeImage = (img) => {
    if (!img) return '/images/shopping.png';
    if (img.startsWith('/public/')) {
        return img.replace('/public', '');
    }
    if (img.startsWith('http')) return img;
    if (img.startsWith('/')) return img;
    return `/images/${img}`;
};

const formatProduct = (product) => {
    const updated = { ...product };

    // Chuẩn hóa ảnh chính
    updated.hinhanh = normalizeImage(updated.hinhanh);

    // Tính giá mới (Logic này hỗ trợ khi dùng .lean() - vì virtuals không tự chạy trên plain object)
    if (updated.gia) {
        if (updated.phantramgiamgia && updated.phantramgiamgia > 0) {
            updated.giaMoi = Math.round(updated.gia * (1 - updated.phantramgiamgia / 100));
        } else {
            updated.giaMoi = updated.gia;
        }
    }

    // Xử lý biến thể (Chuẩn hóa cấu trúc để View dễ render)
    if (updated.bienthe && updated.bienthe.length > 0) {
        updated.bienthe = updated.bienthe.map((variant, idx) => ({
            ...variant,
            mausac: variant.mausac || `Màu ${idx + 1}`,
            hinhanh: normalizeImage(variant.hinhanh),
            colorCode: getColorCode(variant.mausac),
            gia: variant.gia || updated.gia
        }));
    } else if (updated.mausac && updated.mausac.length > 0) {
        // Fallback cho cấu trúc dữ liệu cũ
        updated.bienthe = updated.mausac.map(color => ({
            mausac: color,
            colorCode: getColorCode(color),
            hinhanh: null,
            gia: updated.gia
        }));
    }

    return updated;
};

const formatMoney = (amount) => {
    if (typeof amount !== 'number') return amount;
    return amount.toLocaleString('vi-VN');
};

module.exports = {
    getColorCode,
    normalizeImage,
    formatProduct,
    formatMoney
};