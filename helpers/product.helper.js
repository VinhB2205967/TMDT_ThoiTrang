const bangmamau = {
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

const layMaMau = (tenmau) => {
    if (!tenmau) return '#ccc';
    const mauthuong = tenmau.toLowerCase().trim();
    return bangmamau[mauthuong] || tenmau; 
};

const chuanHoaAnh = (duongdan) => {
    if (!duongdan) return '/images/shopping.png';
    if (duongdan.startsWith('/public/')) {
        return duongdan.replace('/public', '');
    }
    if (duongdan.startsWith('http')) return duongdan;
    if (duongdan.startsWith('/')) return duongdan;
    return `/images/${duongdan}`;
};

const dinhDangSanPham = (sanpham) => {
    const ketqua = { ...sanpham };

    // Chuẩn hóa ảnh chính
    ketqua.hinhanh = chuanHoaAnh(ketqua.hinhanh);

    // Tính giá mới (Logic này hỗ trợ khi dùng .lean() - vì virtuals không tự chạy trên plain object)
    if (ketqua.gia) {
        if (ketqua.phantramgiamgia && ketqua.phantramgiamgia > 0) {
            ketqua.giaMoi = Math.round(ketqua.gia * (1 - ketqua.phantramgiamgia / 100));
        } else {
            ketqua.giaMoi = ketqua.gia;
        }
    }

    // Xử lý biến thể (Chuẩn hóa cấu trúc để View dễ render)
    if (ketqua.bienthe && ketqua.bienthe.length > 0) {
        ketqua.bienthe = ketqua.bienthe.map((variant, idx) => ({
            ...variant,
            mausac: variant.mausac || `Màu ${idx + 1}`,
            hinhanh: chuanHoaAnh(variant.hinhanh),
            colorCode: layMaMau(variant.mausac),
            gia: variant.gia || ketqua.gia
        }));
    } else if (ketqua.mausac && ketqua.mausac.length > 0) {
        // Fallback cho cấu trúc dữ liệu cũ
        ketqua.bienthe = ketqua.mausac.map(color => ({
            mausac: color,
            colorCode: layMaMau(color),
            hinhanh: null,
            gia: ketqua.gia
        }));
    }

    return ketqua;
};

const dinhDangTien = (sotien) => {
    if (typeof sotien !== 'number') return sotien;
    return sotien.toLocaleString('vi-VN');
};

module.exports = {
    layMaMau,
    chuanHoaAnh,
    dinhDangSanPham,
    dinhDangTien
};