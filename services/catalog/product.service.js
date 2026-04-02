const { SIZE_LIST, NO_SIZE_TYPES } = require('../../config/constants');
const mongoose = require('mongoose');
const xss = require('xss');

const PRODUCT_MEDIA_TOKEN_PREFIX = '__PRODUCT_MEDIA_TOKEN__';

function parseObjectId(id) {
    const value = String(id || '').trim();
    if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
    return value;
}

function parseObjectIdArray(input) {
    const values = Array.isArray(input) ? input : (input == null ? [] : [input]);
    const seen = new Set();
    const output = [];
    values.forEach((item) => {
        const parsed = parseObjectId(item);
        if (!parsed || seen.has(parsed)) return;
        seen.add(parsed);
        output.push(parsed);
    });
    return output;
}

function parseJsonArray(input) {
    const raw = Array.isArray(input) ? input[0] : input;
    if (!raw) return [];

    try {
        const parsed = JSON.parse(String(raw));
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    } catch {
        return [];
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizePlainDescription(text) {
    const lines = String(text || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (!lines.length) return '';

    return lines
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('');
}

function replaceDescriptionMediaTokens(html, files, mediaTokens) {
    let output = String(html || '');
    if (!output) return '';

    const uploadedMedia = files && files.mota_media_uploads ? files.mota_media_uploads : [];
    if (!uploadedMedia.length || !mediaTokens.length) return output;

    mediaTokens.forEach((token, index) => {
        const file = uploadedMedia[index];
        if (!token || !file || !file.filename) return;
        output = output.split(`${PRODUCT_MEDIA_TOKEN_PREFIX}${token}`).join(`/uploads/products/${file.filename}`);
    });

    return output;
}

function sanitizeProductDescription(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';

    const source = /<[^>]+>/.test(raw) ? raw : normalizePlainDescription(raw);

    return xss(source, {
        whiteList: {
            p: ['class'],
            br: [],
            strong: [],
            b: [],
            em: [],
            i: [],
            u: [],
            s: [],
            strike: [],
            blockquote: ['class'],
            ul: [],
            ol: [],
            li: [],
            h1: ['class'],
            h2: ['class'],
            h3: ['class'],
            h4: ['class'],
            a: ['href', 'target', 'rel'],
            img: ['src', 'alt', 'title', 'class'],
            video: ['src', 'controls', 'preload', 'playsinline', 'class'],
            source: ['src', 'type'],
            div: ['class'],
            span: ['class']
        },
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style']
    });
}

const prepareProductData = (body, files) => {
    const isNoSizeProduct = NO_SIZE_TYPES.includes(body.loaisanpham);
    let tongSizeGoc = 0;
    const baseSizes = [];

    if (isNoSizeProduct) {
        tongSizeGoc = parseInt(body.soluong_chinh, 10) || 0;
    } else {
        SIZE_LIST.forEach((size) => {
            const qty = parseInt(body[`size_${size}`], 10) || 0;
            if (qty > 0) {
                baseSizes.push({ size, soluong: qty });
                tongSizeGoc += qty;
            }
        });
    }

    const occasionIds = parseObjectIdArray(body.occasions !== undefined ? body.occasions : body.occasion);
    const primaryOccasionId = occasionIds.length ? occasionIds[0] : null;
    const descriptionMediaTokens = parseJsonArray(body.mota_media_tokens);
    const rawDescription = replaceDescriptionMediaTokens(body.mota, files, descriptionMediaTokens);

    const productData = {
        tensanpham: body.tensanpham,
        mota: sanitizeProductDescription(rawDescription),
        gia: parseInt(body.gia, 10) || 0,
        phantramgiamgia: parseInt(body.phantramgiamgia, 10) || 0,
        mausac_chinh: body.mausac_chinh || '',
        sizes: baseSizes,
        soluong_chinh: isNoSizeProduct ? tongSizeGoc : 0,
        gioitinh: body.gioitinh,
        loaisanpham: body.loaisanpham,
        trangthai: body.trangthai || 'dangban',
        occasions: occasionIds,
        occasion: primaryOccasionId,
        dip_sudung_id: primaryOccasionId,
        ageGroup: parseObjectId(body.ageGroup),
        brand: parseObjectId(body.brand || body.thuonghieu_id),
        thuonghieu_id: parseObjectId(body.brand || body.thuonghieu_id)
    };

    if (body.category !== undefined) {
        productData.category = parseObjectId(body.category);
    }

    if (body.sizeguide_id !== undefined) {
        productData.sizeguide_id = parseObjectId(body.sizeguide_id);
    }

    let tongBienThe = 0;
    if (body.bienthe_mausac) {
        const mausacArr = Array.isArray(body.bienthe_mausac) ? body.bienthe_mausac : [body.bienthe_mausac];
        const giaArr = Array.isArray(body.bienthe_gia) ? body.bienthe_gia : [body.bienthe_gia];
        const giamgiaArr = Array.isArray(body.bienthe_giamgia) ? body.bienthe_giamgia : [body.bienthe_giamgia];
        const soluongArr = Array.isArray(body.bienthe_soluong) ? body.bienthe_soluong : [body.bienthe_soluong];

        const oldImageArr = body.bienthe_hinhanh_cu
            ? (Array.isArray(body.bienthe_hinhanh_cu) ? body.bienthe_hinhanh_cu : [body.bienthe_hinhanh_cu])
            : [];
        const hasNewImageArr = body.bienthe_has_new_image
            ? (Array.isArray(body.bienthe_has_new_image) ? body.bienthe_has_new_image : [body.bienthe_has_new_image])
            : [];

        const bientheImages = files && files.bienthe_hinhanh ? files.bienthe_hinhanh : [];
        let imageIndex = 0;

        productData.bienthe = mausacArr.map((mausac, i) => {
            let hinhanh = null;

            if (oldImageArr[i]) {
                hinhanh = oldImageArr[i];
            }

            if (oldImageArr.length > 0 || hasNewImageArr.length > 0) {
                if (hasNewImageArr[i] === '1' && bientheImages[imageIndex]) {
                    hinhanh = `/uploads/products/${bientheImages[imageIndex].filename}`;
                    imageIndex += 1;
                }
            } else if (bientheImages[i]) {
                hinhanh = `/uploads/products/${bientheImages[i].filename}`;
            }

            let variantQty = 0;
            const variantSizes = [];

            if (isNoSizeProduct) {
                variantQty = parseInt(soluongArr[i], 10) || 0;
                tongBienThe += variantQty;
            } else {
                SIZE_LIST.forEach((size) => {
                    const qty = parseInt(body[`bienthe_${i}_size_${size}`], 10) || 0;
                    if (qty > 0) {
                        variantSizes.push({ size, soluong: qty });
                        tongBienThe += qty;
                    }
                });
            }

            return {
                mausac,
                gia: parseInt(giaArr[i], 10) || null,
                phantramgiamgia: parseInt(giamgiaArr[i], 10) || 0,
                hinhanh,
                soluong: variantQty,
                sizes: variantSizes
            };
        }).filter((bt) => bt.mausac && bt.mausac.trim() !== '');
    } else {
        productData.bienthe = [];
    }

    productData.soluongton = tongSizeGoc + tongBienThe;

    if (files && files.hinhanh && files.hinhanh[0]) {
        productData.hinhanh = `/uploads/products/${files.hinhanh[0].filename}`;
    }

    if (files && files.mota_hinhanh && files.mota_hinhanh[0]) {
        productData.mota_hinhanh = `/uploads/products/${files.mota_hinhanh[0].filename}`;
    }

    return productData;
};

module.exports = { prepareProductData };
