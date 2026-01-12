
const { SIZE_LIST, NO_SIZE_TYPES } = require('../config/constants');

const prepareProductData = (body, files) => {
    const isNoSizeProduct = NO_SIZE_TYPES.includes(body.loaisanpham);
    let tongSizeGoc = 0;
    const baseSizes = [];

    // 1. Xử lý sizes gốc (cho sản phẩm chính)
    if (isNoSizeProduct) {
        tongSizeGoc = parseInt(body.soluong_chinh) || 0;
    } else {
        SIZE_LIST.forEach(size => {
            const qty = parseInt(body[`size_${size}`]) || 0;
            if (qty > 0) {
                baseSizes.push({ size: size, soluong: qty });
                tongSizeGoc += qty;
            }
        });
    }

    // 2. Khởi tạo object data cơ bản
    const productData = {
        tensanpham: body.tensanpham,
        mota: body.mota,
        gia: parseInt(body.gia) || 0,
        phantramgiamgia: parseInt(body.phantramgiamgia) || 0,
        mausac_chinh: body.mausac_chinh || '',
        sizes: baseSizes,
        soluong_chinh: isNoSizeProduct ? tongSizeGoc : 0,
        gioitinh: body.gioitinh,
        loaisanpham: body.loaisanpham,
        trangthai: body.trangthai || 'dangban',
        // daxoa và ngaytao sẽ được xử lý riêng ở controller tùy ngữ cảnh
    };

    // 3. Xử lý biến thể
    let tongBienThe = 0;
    if (body.bienthe_mausac) {
        const mausacArr = Array.isArray(body.bienthe_mausac) ? body.bienthe_mausac : [body.bienthe_mausac];
        const giaArr = Array.isArray(body.bienthe_gia) ? body.bienthe_gia : [body.bienthe_gia];
        const giamgiaArr = Array.isArray(body.bienthe_giamgia) ? body.bienthe_giamgia : [body.bienthe_giamgia];
        const soluongArr = Array.isArray(body.bienthe_soluong) ? body.bienthe_soluong : [body.bienthe_soluong];
        
        // Dữ liệu hỗ trợ Edit (nếu có)
        const oldImageArr = body.bienthe_hinhanh_cu ? (Array.isArray(body.bienthe_hinhanh_cu) ? body.bienthe_hinhanh_cu : [body.bienthe_hinhanh_cu]) : [];
        const hasNewImageArr = body.bienthe_has_new_image ? (Array.isArray(body.bienthe_has_new_image) ? body.bienthe_has_new_image : [body.bienthe_has_new_image]) : [];

        // File ảnh biến thể từ Multer
        const bientheImages = files && files['bienthe_hinhanh'] ? files['bienthe_hinhanh'] : [];
        let imageIndex = 0;

        productData.bienthe = mausacArr.map((mausac, i) => {
            // --- Xử lý ảnh biến thể ---
            let hinhanh = null;
            
            // Ưu tiên giữ ảnh cũ nếu có (Logic Edit)
            if (oldImageArr[i]) {
                hinhanh = oldImageArr[i];
            }

            // Kiểm tra xem có ảnh mới upload không
            if (oldImageArr.length > 0 || hasNewImageArr.length > 0) {
                // Edit Mode: Dựa vào flag hasNewImageArr để biết biến thể nào có ảnh mới
                if (hasNewImageArr[i] === '1' && bientheImages[imageIndex]) {
                    hinhanh = '/uploads/products/' + bientheImages[imageIndex].filename;
                    imageIndex++;
                }
            } else {
                // Create Mode: Lấy theo index (giả định input file đồng bộ)
                if (bientheImages[i]) {
                    hinhanh = '/uploads/products/' + bientheImages[i].filename;
                }
            }

            // --- Xử lý số lượng/size biến thể ---
            let variantQty = 0;
            const variantSizes = [];

            if (isNoSizeProduct) {
                variantQty = parseInt(soluongArr[i]) || 0;
                tongBienThe += variantQty;
            } else {
                SIZE_LIST.forEach(size => {
                    const qty = parseInt(body[`bienthe_${i}_size_${size}`]) || 0;
                    if (qty > 0) {
                        variantSizes.push({ size: size, soluong: qty });
                        tongBienThe += qty;
                    }
                });
            }

            return {
                mausac: mausac,
                gia: parseInt(giaArr[i]) || null,
                phantramgiamgia: parseInt(giamgiaArr[i]) || 0,
                hinhanh: hinhanh,
                soluong: variantQty,
                sizes: variantSizes
            };
        }).filter(bt => bt.mausac && bt.mausac.trim() !== '');
    } else {
        productData.bienthe = [];
    }

    // Cập nhật tổng tồn kho
    productData.soluongton = tongSizeGoc + tongBienThe;

    // 4. Xử lý ảnh chính (nếu có upload mới)
    if (files && files['hinhanh'] && files['hinhanh'][0]) {
        productData.hinhanh = '/uploads/products/' + files['hinhanh'][0].filename;
    }
    
    return productData;
};

module.exports = { prepareProductData };
