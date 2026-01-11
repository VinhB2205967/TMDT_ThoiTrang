// Chuẩn hóa ảnh
const normalizeImage = (hinhanh) => {
    if (!hinhanh) return '/images/shopping.png';
    
    if (hinhanh.startsWith('/public/')) {
        hinhanh = hinhanh.replace('/public', '');
    }
    
    if (hinhanh.startsWith('http') || hinhanh.startsWith('/')) {
        return hinhanh;
    }
    
    return `/images/${hinhanh}`;
};

// Chuẩn hóa giá
const normalizePrice = (gia, phantramgiamgia) => {
    if (!gia) return {};
    
    const discount = phantramgiamgia || 0;
    const giamoi = Math.round(gia * (100 - discount) / 100);
    
    return {
        gia,
        giamoi,
        giaText: gia.toLocaleString('vi-VN') + '₫',
        giamoiText: giamoi.toLocaleString('vi-VN') + '₫'
    };
};

// Tính tồn kho
const calculateStock = (bienthe, soluongton) => {
    if (Array.isArray(bienthe) && bienthe.length) {
        return bienthe.reduce((sum, v) => sum + (Number(v?.soluongton) || 0), 0);
    }
    return Number(soluongton) || 0;
};

// Export hàm normalize chính
module.exports = (item) => {
    const p = { ...item };

    p.displayImage = normalizeImage(p.hinhanh);
    
    const priceData = normalizePrice(p.gia, p.phantramgiamgia);
    Object.assign(p, priceData);
    
    p.tonkho = calculateStock(p.bienthe, p.soluongton);

    return p;
};
