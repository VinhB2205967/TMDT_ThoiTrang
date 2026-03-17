// Chuẩn hóa ảnh
const chuanHoaAnh = (hinhanh) => {
    if (!hinhanh) return '/images/shopping.png';
    
    if (hinhanh.startsWith('/public/')) {
        hinhanh = hinhanh.replace('/public', '');
    }
    
    if (hinhanh.startsWith('http') || hinhanh.startsWith('/')) {
        return hinhanh;
    }
    
    return `/images/${hinhanh}`;
};

const NHAN_LOAI_SAN_PHAM = {
    ao: 'Áo',
    quan: 'Quần',
    vay: 'Váy',
    phukien: 'Phụ kiện',
    giay: 'Giày',
    tui: 'Túi',
    aokhoac: 'Áo khoác'
};

const NHAN_GIOI_TINH = {
    nam: 'Nam',
    nu: 'Nữ',
    unisex: 'Unisex'
};

const NHAN_TRANG_THAI = {
    dangban: 'Đang bán',
    an: 'Ẩn',
    hethang: 'Hết hàng'
};

const chuanHoaNhan = (giaTri, bangNhan, macdinh = '') => {
    const khoa = String(giaTri || '').trim().toLowerCase();
    return bangNhan[khoa] || macdinh || giaTri || '';
};

// Chuẩn hóa giá
const chuanHoaGia = (gia, phantramgiamgia) => {
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

// Tính tồn kho từ sizes (mỗi size có số lượng riêng) hoặc số lượng trực tiếp
const tinhTonKho = (sizes, bienthe, soluongton, soluong_chinh) => {
    let total = 0;
    
    // Tính tổng từ sizes gốc (cho sản phẩm có size)
    if (Array.isArray(sizes) && sizes.length) {
        total += sizes.reduce((sum, s) => sum + (Number(s?.soluong) || 0), 0);
    }
    
    // Cộng số lượng chính (cho sản phẩm không có size như túi, phụ kiện)
    if (soluong_chinh) {
        total += Number(soluong_chinh) || 0;
    }
    
    // Tính tổng từ biến thể
    if (Array.isArray(bienthe) && bienthe.length) {
        bienthe.forEach(bt => {
            // Số lượng trực tiếp của biến thể (cho sản phẩm không có size)
            if (bt?.soluong) {
                total += Number(bt.soluong) || 0;
            }
            // Số lượng theo size của biến thể (cho sản phẩm có size)
            if (Array.isArray(bt?.sizes)) {
                total += bt.sizes.reduce((sum, s) => sum + (Number(s?.soluong) || 0), 0);
            }
        });
    }
    
    // Fallback: nếu không có gì thì dùng soluongton
    if (total === 0 && soluongton) {
        total = Number(soluongton) || 0;
    }
    
    return total;
};

const taoDanhSachAnhNho = (hinhChinh, bienthe) => {
    const mainImage = chuanHoaAnh(hinhChinh);
    const thumbs = [];
    const seen = new Set();

    if (mainImage && mainImage !== '/images/shopping.png') {
        thumbs.push({
            src: mainImage,
            alt: 'Ảnh chính',
            title: 'Ảnh chính',
            isMain: true
        });
        seen.add(mainImage);
    }

    if (Array.isArray(bienthe) && bienthe.length) {
        bienthe.forEach((bt, idx) => {
            const variantImage = chuanHoaAnh(bt && bt.hinhanh);
            if (!variantImage || variantImage === '/images/shopping.png' || seen.has(variantImage)) return;
            thumbs.push({
                src: variantImage,
                alt: (bt && bt.mausac) || `Màu ${idx + 1}`,
                title: (bt && bt.mausac) || `Màu ${idx + 1}`,
                isMain: false
            });
            seen.add(variantImage);
        });
    }

    return thumbs;
};

// Export hàm normalize chính
module.exports = (item) => {
    const p = { ...item };

    p.displayImage = chuanHoaAnh(p.hinhanh);
    
    const priceData = chuanHoaGia(p.gia, p.phantramgiamgia);
    Object.assign(p, priceData);
    
    p.tonkho = tinhTonKho(p.sizes, p.bienthe, p.soluongton, p.soluong_chinh);
    p.loaisanphamHienthi = chuanHoaNhan(p.loaisanpham, NHAN_LOAI_SAN_PHAM, 'Chưa phân loại');
    p.gioitinhHienthi = chuanHoaNhan(p.gioitinh, NHAN_GIOI_TINH, 'Unisex');
    p.trangthaiHienthi = chuanHoaNhan(p.trangthai, NHAN_TRANG_THAI, 'Đang cập nhật');

    // Chuẩn hóa ảnh cho các biến thể
    if (Array.isArray(p.bienthe) && p.bienthe.length) {
        p.bienthe = p.bienthe.map(bt => ({
            ...bt,
            hinhanh: chuanHoaAnh(bt.hinhanh)
        }));
    }

    p.thumbImages = taoDanhSachAnhNho(p.displayImage || p.hinhanh, p.bienthe);

    return p;
};
