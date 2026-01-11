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

// Tính tồn kho từ sizes (mỗi size có số lượng riêng)
const calculateStock = (sizes, bienthe, soluongton) => {
    let total = 0;
    
    // Tính tổng từ sizes gốc
    if (Array.isArray(sizes) && sizes.length) {
        total += sizes.reduce((sum, s) => sum + (Number(s?.soluong) || 0), 0);
    }
    
    // Tính tổng từ sizes của biến thể
    if (Array.isArray(bienthe) && bienthe.length) {
        bienthe.forEach(bt => {
            if (Array.isArray(bt?.sizes)) {
                total += bt.sizes.reduce((sum, s) => sum + (Number(s?.soluong) || 0), 0);
            }
        });
    }
    
    // Fallback: nếu không có sizes thì dùng soluongton
    if (total === 0 && soluongton) {
        total = Number(soluongton) || 0;
    }
    
    return total;
};

// Export hàm normalize chính
module.exports = (item) => {
    const p = { ...item };

    p.displayImage = normalizeImage(p.hinhanh);
    
    const priceData = normalizePrice(p.gia, p.phantramgiamgia);
    Object.assign(p, priceData);
    
    p.tonkho = calculateStock(p.sizes, p.bienthe, p.soluongton);

    // Chuẩn hóa ảnh cho các biến thể
    if (Array.isArray(p.bienthe) && p.bienthe.length) {
        p.bienthe = p.bienthe.map(bt => ({
            ...bt,
            hinhanh: normalizeImage(bt.hinhanh)
        }));
    }

    return p;
};
