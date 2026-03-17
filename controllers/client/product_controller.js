// Danh sách
const sanpham = require("../../models/product_model");
const mongoose = require('mongoose');
const danhgia = require("../../models/review_model");
const searchHelper = require('../../helpers/search');
const productHelper = require('../../helpers/product');
const productViewHelper = require('../../helpers/productView');
const { buildProductStats, applyProductStats } = require('../../helpers/productStats');
const Brand = require('../../models/brand_model');
const Danhmuc = require('../../models/category_model');
const SizeGuide = require('../../models/size_guide_model');
const { getCategoryTree, flattenTreeOptions } = require('../../services/category.service');
const { getFlashSalePercentMap, tinhGiaFlash } = require('../../services/flashSale.service');
const { normalizeGuideTypeFromProductType, ensureDefaultSizeGuides } = require('../../services/sizeGuide.service');
const { rankProductsByImage } = require('../../services/openClip.service');

async function timHoacTaoDanhMuc({ name, slug, type, parentId = null, order = 0 }) {
    const existed = await Danhmuc.findOne({ slug, daxoa: { $ne: true } }).select('_id').lean();
    if (existed?._id) return existed._id;

    const doc = await Danhmuc.create({
        name,
        tendanhmuc: name,
        slug,
        type,
        parent_id: parentId,
        danhmuccha: parentId,
        order,
        thutu: order,
        isActive: true,
        trangthai: 'active',
        daxoa: false
    });
    return doc._id;
}

async function damBaoDanhMucMacDinh() {
    const occasionCount = await Danhmuc.countDocuments({ daxoa: { $ne: true }, type: 'occasion' });
    if (!occasionCount) {
        const rootId = await timHoacTaoDanhMuc({ name: 'Dịp sử dụng', slug: 'taxonomy-occasion-root', type: 'occasion', order: 0 });
        const items = [
            { name: 'Đi làm', slug: 'occasion-di-lam' },
            { name: 'Đi chơi', slug: 'occasion-di-choi' },
            { name: 'Dự tiệc', slug: 'occasion-du-tiec' },
            { name: 'Thể thao', slug: 'occasion-the-thao' },
            { name: 'Ở nhà', slug: 'occasion-o-nha' }
        ];
        for (let index = 0; index < items.length; index += 1) {
            await timHoacTaoDanhMuc({
                name: items[index].name,
                slug: items[index].slug,
                type: 'occasion',
                parentId: rootId,
                order: index + 1
            });
        }
    }

    const ageCount = await Danhmuc.countDocuments({ daxoa: { $ne: true }, type: 'age_group' });
    if (!ageCount) {
        const rootId = await timHoacTaoDanhMuc({ name: 'Nhóm tuổi', slug: 'taxonomy-age-group-root', type: 'age_group', order: 0 });
        const items = [
            { name: '1-3 tuổi', slug: 'age-group-1-3' },
            { name: '4-6 tuổi', slug: 'age-group-4-6' },
            { name: '7-10 tuổi', slug: 'age-group-7-10' },
            { name: '11-14 tuổi', slug: 'age-group-11-14' }
        ];
        for (let index = 0; index < items.length; index += 1) {
            await timHoacTaoDanhMuc({
                name: items[index].name,
                slug: items[index].slug,
                type: 'age_group',
                parentId: rootId,
                order: index + 1
            });
        }
    }
}

async function layBoLocNangCao() {
    let [occasionTree, ageGroupTree, brands] = await Promise.all([
        getCategoryTree({ type: 'occasion', isActive: true }),
        getCategoryTree({ type: 'age_group', isActive: true }),
        Brand.find({
            daXoa: { $ne: true },
            $or: [{ hienthi: true }, { isActive: true }]
        }).sort({ order: 1, thuTu: 1, ten: 1 }).lean()
    ]);

    if (!flattenTreeOptions(occasionTree).length || !flattenTreeOptions(ageGroupTree).length) {
        await damBaoDanhMucMacDinh();
        [occasionTree, ageGroupTree] = await Promise.all([
            getCategoryTree({ type: 'occasion', isActive: true }),
            getCategoryTree({ type: 'age_group', isActive: true })
        ]);
    }

    return {
        occasionOptions: flattenTreeOptions(occasionTree),
        ageGroupOptions: flattenTreeOptions(ageGroupTree),
        brandOptions: brands || []
    };
}

function chuanHoaSanPhamDanhSach(item) {
    const p = productHelper(item);

    // Giữ tương thích với view hiện tại: dùng item.hinhanh
    p.hinhanh = p.displayImage || productViewHelper.chuanHoaAnh(p.hinhanh);

    // Hỗ trợ cả 2 cấu trúc dữ liệu biến thể
    if (p.bienthe && p.bienthe.length > 0) {
        p.bienthe = p.bienthe.map((variant, idx) => ({
            ...variant,
            mausac: variant.mausac || `Màu ${idx + 1}`,
            hinhanh: productViewHelper.chuanHoaAnh(variant.hinhanh),
            colorCode: productViewHelper.layMaMau(variant.mausac)
        }));
    } else if (p.mausac && p.mausac.length > 0) {
        // Chuyển mausac array thành bienthe để view hiển thị được
        p.bienthe = p.mausac.map(color => ({
            mausac: color,
            colorCode: productViewHelper.layMaMau(color),
            hinhanh: null,
            gia: p.gia
        }));
    }

    return p;
}

function ganGiaFlashSaleChoSanPham(product, flashPercentMap) {
    if (!product || !product._id || !(flashPercentMap instanceof Map)) return product;

    const percent = Number(flashPercentMap.get(String(product._id)) || 0);
    if (percent <= 0) return product;

    const giaGoc = Number(product.gia || 0);
    const flashGia = tinhGiaFlash(giaGoc, percent);
    if (!Number.isFinite(flashGia)) return product;

    product.flashSalePercent = percent;
    product.flashSalePrice = flashGia;
    product.phantramgiamgia = percent;
    product.giamoi = flashGia;
    product.giamoiText = `${flashGia.toLocaleString('vi-VN')}₫`;

    if (Array.isArray(product.bienthe)) {
        product.bienthe = product.bienthe.map((variant) => {
            const giaBienThe = Number((variant && variant.gia) || giaGoc || 0);
            const giaBienTheSauGiam = tinhGiaFlash(giaBienThe, percent);
            return {
                ...variant,
                phantramgiamgia: percent,
                giamoi: Number.isFinite(giaBienTheSauGiam) ? giaBienTheSauGiam : giaBienThe
            };
        });
    }

    return product;
}

function parseOpenclipIds(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    const ids = text
        .split(',')
        .map((item) => String(item || '').trim())
        .filter((item) => mongoose.Types.ObjectId.isValid(item));
    return Array.from(new Set(ids)).slice(0, 80);
}

function buildOpenclipPreviewUrl(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const marker = '/public/uploads/openclip-query/';
    const index = normalized.lastIndexOf(marker);
    if (index >= 0) {
        return normalized.slice(index + '/public'.length);
    }

    const fileName = normalized.split('/').pop();
    return fileName ? `/uploads/openclip-query/${fileName}` : '';
}

function parseOpenclipPreview(raw) {
    const value = String(raw || '').trim();
    if (!value.startsWith('/uploads/openclip-query/')) return '';
    return value;
}

function parseSortOption(raw) {
    const text = String(raw || '').trim();
    if (!text) return { key: 'ngaytao', direction: 'desc', isDefault: true };

    const [key, direction] = text.split('-');
    const allowedKeys = new Set(['gia', 'ngaytao', 'tensanpham']);
    const allowedDirections = new Set(['asc', 'desc']);
    if (!allowedKeys.has(key) || !allowedDirections.has(direction)) {
        return { key: 'ngaytao', direction: 'desc', isDefault: true };
    }

    return { key, direction, isDefault: false };
}

function getDisplayedPrice(product) {
    const flashPrice = Number(product && product.flashSalePrice);
    if (Number.isFinite(flashPrice) && flashPrice > 0) return flashPrice;

    const salePrice = Number(product && product.giamoi);
    if (Number.isFinite(salePrice) && salePrice > 0) return salePrice;

    return Number(product && product.gia) || 0;
}

function compareProductsBySort(a, b, sortOption, openclipOrderMap) {
    if (sortOption.isDefault && openclipOrderMap instanceof Map) {
        const ai = openclipOrderMap.has(String(a && a._id ? a._id : '')) ? openclipOrderMap.get(String(a._id)) : Number.MAX_SAFE_INTEGER;
        const bi = openclipOrderMap.has(String(b && b._id ? b._id : '')) ? openclipOrderMap.get(String(b._id)) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
    }

    const direction = sortOption.direction === 'asc' ? 1 : -1;

    if (sortOption.key === 'gia') {
        const diff = getDisplayedPrice(a) - getDisplayedPrice(b);
        if (diff !== 0) return diff * direction;
    }

    if (sortOption.key === 'tensanpham') {
        const diff = String(a && a.tensanpham ? a.tensanpham : '').localeCompare(
            String(b && b.tensanpham ? b.tensanpham : ''),
            'vi',
            { sensitivity: 'base' }
        );
        if (diff !== 0) return diff * direction;
    }

    if (sortOption.key === 'ngaytao') {
        const aTime = new Date(a && a.ngaytao ? a.ngaytao : 0).getTime();
        const bTime = new Date(b && b.ngaytao ? b.ngaytao : 0).getTime();
        const diff = aTime - bTime;
        if (diff !== 0) return diff * direction;
    }

    if (openclipOrderMap instanceof Map) {
        const ai = openclipOrderMap.has(String(a && a._id ? a._id : '')) ? openclipOrderMap.get(String(a._id)) : Number.MAX_SAFE_INTEGER;
        const bi = openclipOrderMap.has(String(b && b._id ? b._id : '')) ? openclipOrderMap.get(String(b._id)) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
    }

    return String(a && a._id ? a._id : '').localeCompare(String(b && b._id ? b._id : ''));
}

module.exports.danhSach = async (req, res) => {
    try {
        const filterOptions = await layBoLocNangCao();
        const openclipIds = parseOpenclipIds(req.query.openclip_ids);
        const openclipPreview = parseOpenclipPreview(req.query.openclip_preview);
        const sortOption = parseSortOption(req.query.sort);
        // Search
        const doituongtimkiem = searchHelper(req.query, { keywordKey: 'keyword' });
        
        // Build query
        const boloc = {
            daxoa: { $ne: true },
            trangthai: 'dangban'
        };
        
        // Tìm kiếm theo từ khóa
        if (doituongtimkiem.keyword && openclipIds.length === 0) {
            boloc.tensanpham = doituongtimkiem.regex;
        }

        if (openclipIds.length > 0) {
            boloc._id = { $in: openclipIds.map((id) => new mongoose.Types.ObjectId(id)) };
        }
        
        // Lọc theo loại sản phẩm
        const taploaichophep = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
        if (req.query.loaisanpham && taploaichophep.has(req.query.loaisanpham)) {
            boloc.loaisanpham = req.query.loaisanpham;
        }

        // Lọc theo giới tính
        const tapgioitinhchophep = new Set(['nam', 'nu', 'unisex', 'tre-em']);
        if (req.query.gioitinh && tapgioitinhchophep.has(req.query.gioitinh)) {
            boloc.gioitinh = req.query.gioitinh;
        }

        // Lọc theo thương hiệu
        if (req.query.brand && mongoose.Types.ObjectId.isValid(req.query.brand)) {
            boloc.$or = [
                { thuonghieu_id: req.query.brand },
                { brand: req.query.brand }
            ];
        }

        // Lọc theo dịp
        if (req.query.occasion && mongoose.Types.ObjectId.isValid(req.query.occasion)) {
            boloc.occasion = req.query.occasion;
        }

        // Lọc theo nhóm tuổi
        if (req.query.ageGroup && mongoose.Types.ObjectId.isValid(req.query.ageGroup)) {
            boloc.ageGroup = req.query.ageGroup;
        }
        
        // Lọc theo khoảng giá (giá sau giảm)
        if (req.query.priceMin || req.query.priceMax) {
            const giatu = parseInt(req.query.priceMin) || 0;
            const giaden = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;
            
            boloc.$expr = {
                $and: [
                    {
                        $gte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giatu
                        ]
                    },
                    {
                        $lte: [
                            { $multiply: ['$gia', { $divide: [{ $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] }, 100] }] },
                            giaden
                        ]
                    }
                ]
            };
        }
        
        // Sắp xếp (whitelist)
        const sapxep = openclipIds.length > 0 && sortOption.isDefault
            ? { _id: 1 }
            : sortOption.key === 'tensanpham'
                ? { tensanpham: sortOption.direction === 'asc' ? 1 : -1 }
                : { ngaytao: sortOption.direction === 'asc' ? 1 : -1 };
        
        const danhsachsanpham = await sanpham.find(boloc).sort(sapxep).lean();
        const ids = (danhsachsanpham || []).map(p => p && p._id).filter(Boolean);
        const flashPercentMap = await getFlashSalePercentMap(ids);
        const capnhatsp = (danhsachsanpham || [])
            .map(chuanHoaSanPhamDanhSach)
            .map((item) => ganGiaFlashSaleChoSanPham(item, flashPercentMap));
        const { ratingMap, soldMap } = await buildProductStats(ids);
        let capnhatspDayDu = applyProductStats(capnhatsp, ratingMap, soldMap);

        const openclipOrderMap = openclipIds.length > 0
            ? new Map(openclipIds.map((id, index) => [String(id), index]))
            : null;

        if (openclipOrderMap || sortOption.key === 'gia' || sortOption.key === 'tensanpham' || sortOption.key === 'ngaytao') {
            capnhatspDayDu = capnhatspDayDu.sort((a, b) => compareProductsBySort(a, b, sortOption, openclipOrderMap));
        }

        const openclipMode = openclipIds.length > 0;
        const openclipStatus = String(req.query.openclip_status || '').trim();
        const openclipMessage = openclipStatus === 'empty'
            ? 'Không tìm thấy sản phẩm phù hợp từ ảnh.'
            : openclipStatus === 'error'
                ? 'Không thể tìm kiếm bằng ảnh lúc này. Vui lòng thử lại.'
                : '';

        res.render("client/pages/products/index.pug", {
            titlePage: "Danh sách sản phẩm",
            products: capnhatspDayDu,
            keyword: openclipMode ? '' : doituongtimkiem.keyword,
            openclipIdsValue: openclipIds.join(','),
            openclipPreview,
            currentSort: req.query.sort,
            currentLoai: req.query.loaisanpham,
            currentGioiTinh: req.query.gioitinh,
            currentBrand: req.query.brand,
            currentOccasion: req.query.occasion,
            currentAgeGroup: req.query.ageGroup,
            priceMin: req.query.priceMin,
            priceMax: req.query.priceMax,
            openclipMode,
            openclipMessage,
            ...filterOptions
        });
    } catch (error) {
        console.error("Lỗi lấy sản phẩm:", error);
        res.status(500).send("Lỗi server");
    }
};



// Chi tiết
module.exports.chiTiet = async (req, res) => {
    try {
        const idsanpham = req.params.id;
        const sanphamdoc = await sanpham.findById(idsanpham).lean();
        if (!sanphamdoc) {
            return res.status(404).render('client/pages/products/detail.pug', { titlePage: 'Sản phẩm không tồn tại' });
        }

        const capnhatsp = productHelper(sanphamdoc);
        capnhatsp.hinhanh = capnhatsp.displayImage || productViewHelper.chuanHoaAnh(capnhatsp.hinhanh);
        const flashPercentMap = await getFlashSalePercentMap([sanphamdoc._id]);
        ganGiaFlashSaleChoSanPham(capnhatsp, flashPercentMap);

        // Tạo danh sách tất cả các lựa chọn màu
        let tatcabienthe = [];
        
        // LUÔN thêm sản phẩm chính như biến thể đầu tiên
        const mauchinh = capnhatsp.mausac_chinh || 'Mặc định';
        const sizechinh = capnhatsp.sizes || [];
        tatcabienthe.push({
            _id: 'main',
            mausac: mauchinh,
            hinhanh: capnhatsp.hinhanh || '/images/shopping.png',
            colorCode: productViewHelper.layMaMau(mauchinh),
            gia: capnhatsp.gia,
            phantramgiamgia: capnhatsp.phantramgiamgia,
            sizes: sizechinh,
            soluong: capnhatsp.soluong_chinh || 0,
            isMain: true
        });
        
        // Thêm tất cả các biến thể
        if (capnhatsp.bienthe && capnhatsp.bienthe.length > 0) {
            capnhatsp.bienthe.forEach((bienthe, idx) => {
                const hinhbienthe = productViewHelper.chuanHoaAnh(bienthe.hinhanh);
                const sizebienthe = bienthe.sizes || [];
                tatcabienthe.push({
                    ...bienthe,
                    _id: bienthe._id || `variant_${idx}`,
                    mausac: bienthe.mausac || `Màu ${tatcabienthe.length + 1}`,
                    hinhanh: (hinhbienthe && hinhbienthe !== '/images/shopping.png') ? hinhbienthe : capnhatsp.hinhanh,
                    colorCode: productViewHelper.layMaMau(bienthe.mausac),
                    gia: bienthe.gia || capnhatsp.gia,
                    phantramgiamgia: bienthe.phantramgiamgia || capnhatsp.phantramgiamgia,
                    sizes: sizebienthe
                });
            });
        } else if (capnhatsp.mausac && capnhatsp.mausac.length > 0) {
            capnhatsp.mausac.forEach(mau => {
                tatcabienthe.push({
                    mausac: mau,
                    colorCode: productViewHelper.layMaMau(mau),
                    hinhanh: capnhatsp.hinhanh,
                    gia: capnhatsp.gia,
                    sizes: []
                });
            });
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log('Variants count:', tatcabienthe.length);
        }
        
        // Gán lại biến thể đã được xử lý
        capnhatsp.bienthe = tatcabienthe;

        // Lấy đánh giá hiển thị + filter/sort
        const reviewBase = { sanpham_id: idsanpham, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } };
        const allReviewsRaw = await danhgia.find(reviewBase)
            .populate({ path: 'nguoidung_id', select: 'hoten avatar' })
            .lean();

        const laVideo = (url) => /\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(String(url || ''));
        const tachMedia = (review) => {
            const hinhList = Array.isArray(review && review.hinhanh) ? review.hinhanh : [];
            const videoList = Array.isArray(review && review.videos) ? review.videos : [];
            const hinhanh = hinhList.filter((u) => !laVideo(u));
            const videos = Array.from(new Set(hinhList.filter((u) => laVideo(u)).concat(videoList).map((u) => String(u || '').trim()).filter(Boolean)));
            return {
                ...review,
                hinhanh,
                videos,
                user: {
                    ten: review && review.nguoidung_id && review.nguoidung_id.hoten ? String(review.nguoidung_id.hoten) : 'Khách hàng',
                    avatar: review && review.nguoidung_id && review.nguoidung_id.avatar ? String(review.nguoidung_id.avatar) : '/images/avatar/avatar.png'
                }
            };
        };

        const allReviews = (allReviewsRaw || []).map(tachMedia);

        let diemtrungbinh = 0;
        const thongkeSao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        if (allReviews && allReviews.length) {
            const sum = allReviews.reduce((s, r) => {
                const d = Number(r.diem || 0);
                if (thongkeSao[d] != null) thongkeSao[d] += 1;
                return s + d;
            }, 0);
            diemtrungbinh = Math.round((sum / allReviews.length) * 10) / 10;
        }

        const ratingFilter = Number(req.query.rating || 0);
        const mediaQuery = String(req.query.media || '').trim().toLowerCase();
        const hasImageLegacy = String(req.query.hasImage || '') === '1';
        const mediaFilter = mediaQuery || (hasImageLegacy ? 'image' : 'all');
        const sort = String(req.query.sort || 'newest');

        let filtered = allReviews || [];
        if (ratingFilter >= 1 && ratingFilter <= 5) {
            filtered = filtered.filter(r => Number(r.diem || 0) === ratingFilter);
        }
        if (mediaFilter === 'image') {
            filtered = filtered.filter(r => Array.isArray(r.hinhanh) && r.hinhanh.length > 0);
        } else if (mediaFilter === 'video') {
            filtered = filtered.filter(r => Array.isArray(r.videos) && r.videos.length > 0);
        } else if (mediaFilter === 'both') {
            filtered = filtered.filter(r => Array.isArray(r.hinhanh) && r.hinhanh.length > 0 && Array.isArray(r.videos) && r.videos.length > 0);
        }

        if (sort === 'highest') filtered = filtered.sort((a, b) => (b.diem || 0) - (a.diem || 0));
        else if (sort === 'lowest') filtered = filtered.sort((a, b) => (a.diem || 0) - (b.diem || 0));
        else if (sort === 'helpful') filtered = filtered.sort((a, b) => (b.thich || 0) - (a.thich || 0));
        else if (sort === 'oldest') filtered = filtered.sort((a, b) => new Date(a.ngaytao || 0) - new Date(b.ngaytao || 0));
        else filtered = filtered.sort((a, b) => new Date(b.ngaytao || 0) - new Date(a.ngaytao || 0));

        // Sản phẩm tương tự (cùng loại)
        const sanphamlienquan = await sanpham.find({ loaisanpham: sanphamdoc.loaisanpham, _id: { $ne: sanphamdoc._id }, daxoa: { $ne: true }, trangthai: 'dangban' }).limit(6).lean();
        const flashPercentMapRelated = await getFlashSalePercentMap((sanphamlienquan || []).map((sp) => sp && sp._id).filter(Boolean));
        const sanphamlienquanxuly = (sanphamlienquan || []).map(sp => {
            const p = productHelper(sp);
            p.hinhanh = p.displayImage || productViewHelper.chuanHoaAnh(p.hinhanh);
            return ganGiaFlashSaleChoSanPham(p, flashPercentMapRelated);
        });

        await ensureDefaultSizeGuides(SizeGuide);
        let sizeGuide = null;
        if (sanphamdoc.sizeguide_id && mongoose.Types.ObjectId.isValid(String(sanphamdoc.sizeguide_id))) {
            sizeGuide = await SizeGuide.findOne({ _id: sanphamdoc.sizeguide_id, daxoa: { $ne: true } }).lean();
        }
        if (!sizeGuide) {
            const guideType = normalizeGuideTypeFromProductType(capnhatsp.loaisanpham);
            if (guideType) {
                sizeGuide = await SizeGuide.findOne({
                    loaisanpham: guideType,
                    daxoa: { $ne: true }
                }).sort({ ngaycapnhat: -1, ngaytao: -1 }).lean();
            }
        }

        res.render('client/pages/products/detail.pug', {
            titlePage: capnhatsp.tensanpham || 'Chi tiết sản phẩm',
            product: capnhatsp,
            sizeGuide,
            reviews: filtered || [],
            avgRating: diemtrungbinh,
            reviewStats: {
                total: (allReviews || []).length,
                byStar: thongkeSao
            },
            reviewFilters: {
                rating: ratingFilter || '',
                media: mediaFilter,
                sort
            },
            related: sanphamlienquanxuly
        });
    } catch (error) {
        console.error('Lỗi lấy chi tiết sản phẩm:', error);
        res.status(500).send('Lỗi server');
    }
};


// Tùy chọn
module.exports.tuyChon = async (req, res) => {
    try {
        const idsanpham = req.params.id;
        const sanphamdoc = await sanpham.findOne({ _id: idsanpham, daxoa: { $ne: true }, trangthai: 'dangban' }).lean();
        if (!sanphamdoc) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

        const capnhatsp = productHelper(sanphamdoc);
        capnhatsp.hinhanh = capnhatsp.displayImage || productViewHelper.chuanHoaAnh(capnhatsp.hinhanh);
        const flashPercentMap = await getFlashSalePercentMap([sanphamdoc._id]);
        ganGiaFlashSaleChoSanPham(capnhatsp, flashPercentMap);

        const khongsize = ['tui', 'phukien'];
        const cosize = !khongsize.includes(String(capnhatsp.loaisanpham || '').toLowerCase());

        const giagoc = capnhatsp.gia || 0;
        const giamgoc = capnhatsp.phantramgiamgia || 0;
        const giamoigoc = giamgoc > 0 ? Math.round(giagoc * (100 - giamgoc) / 100) : giagoc;

        const danhsachbienthe = [];

        // Main variant
        danhsachbienthe.push({
            id: 'main',
            mausac: capnhatsp.mausac_chinh || 'Mặc định',
            hinhanh: capnhatsp.hinhanh || '/images/shopping.png',
            gia: giagoc,
            phantramgiamgia: giamgoc,
            giamoi: giamoigoc,
            soluong: capnhatsp.soluong_chinh || 0,
            sizes: Array.isArray(capnhatsp.sizes) ? capnhatsp.sizes.map(s => ({ size: s.size, soluong: s.soluong || 0 })) : []
        });

        // DB variants
        if (capnhatsp.bienthe && capnhatsp.bienthe.length) {
            capnhatsp.bienthe.forEach((bienthe) => {
                const gia = bienthe.gia || giagoc;
                const giam = bienthe.phantramgiamgia != null ? bienthe.phantramgiamgia : giamgoc;
                const giamoi = giam > 0 ? Math.round(gia * (100 - giam) / 100) : gia;
                danhsachbienthe.push({
                    id: String(bienthe._id),
                    mausac: bienthe.mausac || 'Màu',
                    hinhanh: (productViewHelper.chuanHoaAnh(bienthe.hinhanh) || capnhatsp.hinhanh || '/images/shopping.png'),
                    gia,
                    phantramgiamgia: giam,
                    giamoi,
                    soluong: bienthe.soluong || 0,
                    sizes: Array.isArray(bienthe.sizes) ? bienthe.sizes.map(s => ({ size: s.size, soluong: s.soluong || 0 })) : []
                });
            });
        }

        return res.json({
            success: true,
            product: {
                id: String(capnhatsp._id),
                tensanpham: capnhatsp.tensanpham,
                hinhanh: capnhatsp.hinhanh || '/images/shopping.png',
                gia: giagoc,
                phantramgiamgia: giamgoc,
                giamoi: giamoigoc,
                hasSize: cosize,
                variants: danhsachbienthe
            }
        });
    } catch (error) {
        console.error('options error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

module.exports.timBangAnh = async (req, res) => {
    const uploadedPath = req.file && req.file.path ? String(req.file.path) : '';
    try {
        if (!uploadedPath) {
            return res.redirect('/products?openclip_status=empty');
        }

        const rows = await sanpham.find({
            daxoa: { $ne: true },
            trangthai: 'dangban',
            hinhanh: { $exists: true, $ne: '' }
        })
            .select('_id tensanpham hinhanh bienthe gia phantramgiamgia soluongton gioitinh loaisanpham')
            .sort({ ngaycapnhat: -1, ngaytao: -1 })
            .limit(320)
            .lean();

        const products = (rows || []).map((item) => {
            const basePrice = Number(item.gia || 0);
            const percent = Number(item.phantramgiamgia || 0);
            return {
                id: String(item._id || ''),
                tensanpham: String(item.tensanpham || 'Sản phẩm'),
                imageUrl: String(item.hinhanh || '/images/shopping.png'),
                url: item._id ? `/products/${item._id}` : '',
                gia: basePrice,
                giaSauGiam: percent > 0 ? Math.round(basePrice * (1 - percent / 100)) : basePrice,
                phantramgiamgia: percent,
                soluongton: Number(item.soluongton || 0),
                gioitinh: String(item.gioitinh || ''),
                loaisanpham: String(item.loaisanpham || ''),
                variantImages: Array.isArray(item.bienthe)
                    ? item.bienthe
                        .map(bt => String(bt && bt.hinhanh ? bt.hinhanh : ''))
                        .filter(img => img && img !== '' && img !== '/images/shopping.png')
                        .slice(0, 5)
                    : []
            };
        });

        const ranked = await rankProductsByImage({ imagePath: uploadedPath, products, topK: 60 });
        const ids = Array.isArray(ranked.matches)
            ? ranked.matches.map((item) => String(item && item.id ? item.id : '')).filter(Boolean)
            : [];

        if (ids.length === 0) {
            return res.redirect('/products?openclip_status=empty');
        }

        const previewUrl = buildOpenclipPreviewUrl(uploadedPath);
        return res.redirect(`/products?openclip_ids=${encodeURIComponent(ids.join(','))}&openclip_preview=${encodeURIComponent(previewUrl)}`);
    } catch (error) {
        console.error('Product image search error:', error);
        return res.redirect('/products?openclip_status=error');
    }
};