
const { SIZE_LIST, NO_SIZE_TYPES } = require('../../config/constants');
const mongoose = require('mongoose');

function parseObjectId(id) {
    const value = String(id || '').trim();
    if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
    return value;
}

const prepareProductData = (body, files) => {
    const isNoSizeProduct = NO_SIZE_TYPES.includes(body.loaisanpham);
    let tongSizeGoc = 0;
    const baseSizes = [];

    // 1. Xá»­ lÃ½ sizes gá»‘c (cho sáº£n pháº©m chÃ­nh)
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

    // 2. Khá»Ÿi táº¡o object data cÆ¡ báº£n
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
        occasion: parseObjectId(body.occasion),
        ageGroup: parseObjectId(body.ageGroup),
        brand: parseObjectId(body.brand || body.thuonghieu_id),
        thuonghieu_id: parseObjectId(body.brand || body.thuonghieu_id),
        // daxoa vÃ  ngaytao sáº½ Ä‘Æ°á»£c xá»­ lÃ½ riÃªng á»Ÿ controller tÃ¹y ngá»¯ cáº£nh
    };

    if (body.category !== undefined) {
        productData.category = parseObjectId(body.category);
    }

    if (body.sizeguide_id !== undefined) {
        productData.sizeguide_id = parseObjectId(body.sizeguide_id);
    }

    // 3. Xá»­ lÃ½ biáº¿n thá»ƒ
    let tongBienThe = 0;
    if (body.bienthe_mausac) {
        const mausacArr = Array.isArray(body.bienthe_mausac) ? body.bienthe_mausac : [body.bienthe_mausac];
        const giaArr = Array.isArray(body.bienthe_gia) ? body.bienthe_gia : [body.bienthe_gia];
        const giamgiaArr = Array.isArray(body.bienthe_giamgia) ? body.bienthe_giamgia : [body.bienthe_giamgia];
        const soluongArr = Array.isArray(body.bienthe_soluong) ? body.bienthe_soluong : [body.bienthe_soluong];
        
        // Dá»¯ liá»‡u há»— trá»£ Edit (náº¿u cÃ³)
        const oldImageArr = body.bienthe_hinhanh_cu ? (Array.isArray(body.bienthe_hinhanh_cu) ? body.bienthe_hinhanh_cu : [body.bienthe_hinhanh_cu]) : [];
        const hasNewImageArr = body.bienthe_has_new_image ? (Array.isArray(body.bienthe_has_new_image) ? body.bienthe_has_new_image : [body.bienthe_has_new_image]) : [];

        // File áº£nh biáº¿n thá»ƒ tá»« Multer
        const bientheImages = files && files['bienthe_hinhanh'] ? files['bienthe_hinhanh'] : [];
        let imageIndex = 0;

        productData.bienthe = mausacArr.map((mausac, i) => {
            // --- Xá»­ lÃ½ áº£nh biáº¿n thá»ƒ ---
            let hinhanh = null;
            
            // Æ¯u tiÃªn giá»¯ áº£nh cÅ© náº¿u cÃ³ (Logic Edit)
            if (oldImageArr[i]) {
                hinhanh = oldImageArr[i];
            }

            // Kiá»ƒm tra xem cÃ³ áº£nh má»›i upload khÃ´ng
            if (oldImageArr.length > 0 || hasNewImageArr.length > 0) {
                // Edit Mode: Dá»±a vÃ o flag hasNewImageArr Ä‘á»ƒ biáº¿t biáº¿n thá»ƒ nÃ o cÃ³ áº£nh má»›i
                if (hasNewImageArr[i] === '1' && bientheImages[imageIndex]) {
                    hinhanh = '/uploads/products/' + bientheImages[imageIndex].filename;
                    imageIndex++;
                }
            } else {
                // Create Mode: Láº¥y theo index (giáº£ Ä‘á»‹nh input file Ä‘á»“ng bá»™)
                if (bientheImages[i]) {
                    hinhanh = '/uploads/products/' + bientheImages[i].filename;
                }
            }

            // --- Xá»­ lÃ½ sá»‘ lÆ°á»£ng/size biáº¿n thá»ƒ ---
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

    // Cáº­p nháº­t tá»•ng tá»“n kho
    productData.soluongton = tongSizeGoc + tongBienThe;

    // 4. Xá»­ lÃ½ áº£nh chÃ­nh (náº¿u cÃ³ upload má»›i)
    if (files && files['hinhanh'] && files['hinhanh'][0]) {
        productData.hinhanh = '/uploads/products/' + files['hinhanh'][0].filename;
    }

    if (files && files['mota_hinhanh'] && files['mota_hinhanh'][0]) {
        productData.mota_hinhanh = '/uploads/products/' + files['mota_hinhanh'][0].filename;
    }
    
    return productData;
};

module.exports = { prepareProductData };

