const mongoose = require('mongoose');
const Sanpham = require('../../models/product_model');
const OrderItem = require('../../models/order_item_model');
const Brand = require('../../models/brand_model');
const Danhmuc = require('../../models/category_model');
const SizeGuide = require('../../models/size_guide_model');
const filterStatusHelper = require('../../helpers/filterStatus');
const searchHelper = require('../../helpers/search');
const paginationHelper = require('../../helpers/pagination');
const productHelper = require('../../helpers/product');
const { prepareProductData } = require('./product.service.js');
const { getCategoryTree, flattenTreeOptions } = require('./category.service.js');
const { ensureDefaultSizeGuides } = require('./sizeGuide.service.js');

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
  const occasionCount = await Danhmuc.countDocuments({
    daxoa: { $ne: true },
    type: 'occasion'
  });

  if (!occasionCount) {
    const occasionRootId = await timHoacTaoDanhMuc({
      name: 'Dịp sử dụng',
      slug: 'taxonomy-occasion-root',
      type: 'occasion',
      order: 0
    });

    const occasionItems = [
      { name: 'Đi làm', slug: 'occasion-di-lam' },
      { name: 'Đi chơi', slug: 'occasion-di-choi' },
      { name: 'Dự tiệc', slug: 'occasion-du-tiec' },
      { name: 'Thể thao', slug: 'occasion-the-thao' },
      { name: 'Ở nhà', slug: 'occasion-o-nha' }
    ];

    for (let index = 0; index < occasionItems.length; index += 1) {
      const item = occasionItems[index];
      await timHoacTaoDanhMuc({
        name: item.name,
        slug: item.slug,
        type: 'occasion',
        parentId: occasionRootId,
        order: index + 1
      });
    }
  }

  const ageGroupCount = await Danhmuc.countDocuments({
    daxoa: { $ne: true },
    type: 'age_group'
  });

  if (!ageGroupCount) {
    const ageRootId = await timHoacTaoDanhMuc({
      name: 'Nhóm tuổi',
      slug: 'taxonomy-age-group-root',
      type: 'age_group',
      order: 0
    });

    const ageItems = [
      { name: '1-3 tuổi', slug: 'age-group-1-3' },
      { name: '4-6 tuổi', slug: 'age-group-4-6' },
      { name: '7-10 tuổi', slug: 'age-group-7-10' },
      { name: '11-14 tuổi', slug: 'age-group-11-14' }
    ];

    for (let index = 0; index < ageItems.length; index += 1) {
      const item = ageItems[index];
      await timHoacTaoDanhMuc({
        name: item.name,
        slug: item.slug,
        type: 'age_group',
        parentId: ageRootId,
        order: index + 1
      });
    }
  }
}

async function layDuLieuPhanLoaiSanPham() {
  await ensureDefaultSizeGuides(SizeGuide);

  let [occasionTree, ageGroupTree, brands] = await Promise.all([
    getCategoryTree({ type: 'occasion', isActive: true }),
    getCategoryTree({ type: 'age_group', isActive: true }),
    Brand.find({
      daXoa: { $ne: true },
      $or: [{ hienthi: true }, { isActive: true }]
    }).sort({ order: 1, thuTu: 1, ten: 1 }).lean()
  ]);

  const sizeGuideOptions = await SizeGuide.find({ daxoa: { $ne: true } })
    .sort({ loaisanpham: 1, tenbang: 1 })
    .select('_id tenbang loaisanpham')
    .lean();

  const occasionOptions = flattenTreeOptions(occasionTree);
  const ageGroupOptions = flattenTreeOptions(ageGroupTree);

  if (!occasionOptions.length || !ageGroupOptions.length) {
    await damBaoDanhMucMacDinh();
    [occasionTree, ageGroupTree] = await Promise.all([
      getCategoryTree({ type: 'occasion', isActive: true }),
      getCategoryTree({ type: 'age_group', isActive: true })
    ]);
  }

  return {
    occasionOptions: flattenTreeOptions(occasionTree),
    ageGroupOptions: flattenTreeOptions(ageGroupTree),
    brandOptions: brands || [],
    sizeGuideOptions: sizeGuideOptions || []
  };
}

function taoDieuKienLoc(query = {}, keywordRegex) {
  const daxoa = String(query.deleted || '').trim();
  const dieukien =
    daxoa === '1' ? { daxoa: true }
      : daxoa === 'all' ? {}
        : { daxoa: { $ne: true } };

  if (query.trangthai === 'dahet') {
    dieukien.soluongton = { $lte: 0 };
  } else if (query.trangthai) {
    dieukien.trangthai = query.trangthai;
  }

  if (keywordRegex) dieukien.tensanpham = keywordRegex;

  if (query.priceMin || query.priceMax) {
    const giatu = parseInt(query.priceMin, 10) || 0;
    const giaden = parseInt(query.priceMax, 10) || Number.MAX_SAFE_INTEGER;

    dieukien.$expr = {
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

  const taploaichophep = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
  if (query.loaisanpham && taploaichophep.has(query.loaisanpham)) {
    dieukien.loaisanpham = query.loaisanpham;
  }

  const tapgioitinhchophep = new Set(['nam', 'nu', 'unisex']);
  if (query.gioitinh && tapgioitinhchophep.has(query.gioitinh)) {
    dieukien.gioitinh = query.gioitinh;
  }

  const brandId = String(query.brand || '').trim();
  if (brandId && mongoose.Types.ObjectId.isValid(brandId)) {
    dieukien.$or = [
      { thuonghieu_id: brandId },
      { brand: brandId }
    ];
  }

  const occasionId = String(query.occasion || '').trim();
  if (occasionId && mongoose.Types.ObjectId.isValid(occasionId)) {
    dieukien.occasion = occasionId;
  }

  const ageGroupId = String(query.ageGroup || '').trim();
  if (ageGroupId && mongoose.Types.ObjectId.isValid(ageGroupId)) {
    dieukien.ageGroup = ageGroupId;
  }

  if (query.dateFrom || query.dateTo) {
    dieukien.ngaycapnhat = {};
    if (query.dateFrom) dieukien.ngaycapnhat.$gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const ngayketthuc = new Date(query.dateTo);
      ngayketthuc.setHours(23, 59, 59, 999);
      dieukien.ngaycapnhat.$lte = ngayketthuc;
    }
  }

  return { dieukien, daxoa };
}

function taoThongTinSapXep(query = {}) {
  let sapxep = { ngaytao: -1, ngaycapnhat: -1 };
  let khoasapxep = 'ngaytao';
  let chieusapxep = -1;

  if (query.sort) {
    const [khoa, huong] = String(query.sort).split('-');
    const tapkhoasapxep = new Set(['gia', 'ngaytao', 'ngaycapnhat', 'tensanpham']);
    const tapchieusapxep = new Set(['asc', 'desc']);
    if (tapkhoasapxep.has(khoa) && tapchieusapxep.has(huong)) {
      khoasapxep = khoa;
      chieusapxep = huong === 'asc' ? 1 : -1;
      if (khoa === 'ngaycapnhat') sapxep = { ngaycapnhat: chieusapxep, ngaytao: -1 };
      else if (khoa === 'ngaytao') sapxep = { ngaytao: chieusapxep };
      else sapxep = { [khoa]: chieusapxep, ngaycapnhat: -1, ngaytao: -1 };
    }
  }

  return { sapxep, khoasapxep, chieusapxep };
}

function taoChuoiBoLoc(query = {}) {
  let chuoiboloc = '';
  if (query.sort) chuoiboloc += `&sort=${query.sort}`;
  if (query.loaisanpham) chuoiboloc += `&loaisanpham=${query.loaisanpham}`;
  if (query.gioitinh) chuoiboloc += `&gioitinh=${query.gioitinh}`;
  if (query.brand) chuoiboloc += `&brand=${query.brand}`;
  if (query.occasion) chuoiboloc += `&occasion=${query.occasion}`;
  if (query.ageGroup) chuoiboloc += `&ageGroup=${query.ageGroup}`;
  if (query.priceMin) chuoiboloc += `&priceMin=${query.priceMin}`;
  if (query.priceMax) chuoiboloc += `&priceMax=${query.priceMax}`;
  if (query.dateFrom) chuoiboloc += `&dateFrom=${query.dateFrom}`;
  if (query.dateTo) chuoiboloc += `&dateTo=${query.dateTo}`;
  if (query.deleted) chuoiboloc += `&deleted=${query.deleted}`;
  return chuoiboloc;
}

async function getDanhSachData(query = {}) {
  const filterOptions = await layDuLieuPhanLoaiSanPham();
  const boloctrangthai = filterStatusHelper(query);
  const doituongtimkiem = searchHelper(query, { keywordKey: 'keyword' });

  const { dieukien, daxoa } = taoDieuKienLoc(query, doituongtimkiem.keyword ? doituongtimkiem.regex : null);
  const { sapxep, khoasapxep, chieusapxep } = taoThongTinSapXep(query);

  let phantrang = { currentPage: 1, limit: 10 };
  const tongsanpham = await Sanpham.countDocuments(dieukien);
  phantrang = paginationHelper(phantrang, query, tongsanpham);

  let danhsachsanpham;
  if (khoasapxep === 'gia') {
    const bieuthucgiagiam = {
      $multiply: [
        { $ifNull: ['$gia', 0] },
        {
          $divide: [
            { $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] },
            100
          ]
        }
      ]
    };

    danhsachsanpham = await Sanpham.aggregate([
      { $match: dieukien },
      { $addFields: { __giaSauGiam: bieuthucgiagiam } },
      { $sort: { __giaSauGiam: chieusapxep, ngaycapnhat: -1, ngaytao: -1 } },
      { $skip: phantrang.skip },
      { $limit: phantrang.limit }
    ]);
  } else {
    danhsachsanpham = await Sanpham.find(dieukien)
      .sort(sapxep)
      .skip(phantrang.skip)
      .limit(phantrang.limit)
      .lean();
  }

  const pageProductIds = (danhsachsanpham || []).map((p) => String(p?._id || '')).filter(Boolean);
  let daMuaSet = new Set();
  if (pageProductIds.length) {
    const daMuaIds = await OrderItem.distinct('sanpham_id', {
      sanpham_id: { $in: pageProductIds },
      trangthai: { $nin: ['cancelled', 'dahuy'] }
    });
    daMuaSet = new Set((daMuaIds || []).map((id) => String(id)));
  }

  const brandNameMap = new Map((filterOptions.brandOptions || []).map((b) => [String(b._id), b.ten]));
  const chuoiboloc = taoChuoiBoLoc(query);

  return {
    titlePage: 'Danh sách sản phẩm',
    products: (danhsachsanpham || []).map(productHelper).map((p) => ({
      ...p,
      daDuocMua: daMuaSet.has(String(p._id)),
      tenThuongHieu: brandNameMap.get(String(p.brand || p.thuonghieu_id || '')) || '—'
    })),
    filterStatus: boloctrangthai,
    keyword: doituongtimkiem.keyword,
    pagination: phantrang,
    currentSort: query.sort,
    currentLoai: query.loaisanpham,
    currentGioiTinh: query.gioitinh,
    currentBrand: query.brand,
    currentOccasion: query.occasion,
    currentAgeGroup: query.ageGroup,
    priceMin: query.priceMin,
    priceMax: query.priceMax,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    currentDeleted: daxoa,
    filterString: chuoiboloc,
    ...filterOptions
  };
}

async function khoiPhucSanPham(id) {
  const pid = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(pid)) {
    return { ok: false, message: 'ID không hợp lệ' };
  }

  await Sanpham.findByIdAndUpdate(pid, { daxoa: false, ngaycapnhat: new Date() });
  return { ok: true, message: 'Đã khôi phục sản phẩm!' };
}

async function xoaVinhVienSanPham(id) {
  const pid = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(pid)) {
    return { ok: false, message: 'ID không hợp lệ' };
  }

  const daDuocMua = await OrderItem.exists({
    sanpham_id: pid,
    trangthai: { $nin: ['cancelled', 'dahuy'] }
  });
  if (daDuocMua) {
    return { ok: false, message: 'Sản phẩm đã có đơn hàng, không thể xóa' };
  }

  const result = await Sanpham.deleteOne({ _id: pid, daxoa: true });
  if (!result || result.deletedCount !== 1) {
    return { ok: false, message: 'Chỉ được xóa vĩnh viễn sản phẩm đã xóa mềm' };
  }

  return { ok: true, message: 'Đã xóa vĩnh viễn sản phẩm!' };
}

async function getTaoMoiData() {
  const formOptions = await layDuLieuPhanLoaiSanPham();
  return {
    titlePage: 'Thêm sản phẩm mới',
    ...formOptions
  };
}

async function taoMoiSanPham(body, files) {
  const dulieusanpham = prepareProductData(body, files);
  dulieusanpham.daxoa = false;
  dulieusanpham.ngaytao = new Date();
  dulieusanpham.ngaycapnhat = new Date();

  const sanphammoi = new Sanpham(dulieusanpham);
  await sanphammoi.save();

  return { ok: true, message: 'Thêm sản phẩm thành công!' };
}

async function getChinhSuaData(id) {
  const sanphamdoc = await Sanpham.findById(id).lean();
  if (!sanphamdoc) {
    return { ok: false, message: 'Không tìm thấy sản phẩm' };
  }

  const formOptions = await layDuLieuPhanLoaiSanPham();
  return {
    ok: true,
    data: {
      titlePage: 'Chỉnh sửa sản phẩm',
      product: productHelper(sanphamdoc),
      ...formOptions
    }
  };
}

async function capNhatSanPham(id, body, files) {
  const dulieusanpham = prepareProductData(body, files);
  dulieusanpham.ngaycapnhat = new Date();

  await Sanpham.findByIdAndUpdate(id, dulieusanpham);
  return { ok: true, message: 'Cập nhật sản phẩm thành công!' };
}

async function xoaMemSanPham(id) {
  const pid = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(pid)) {
    return { ok: false, message: 'ID không hợp lệ' };
  }

  const daDuocMua = await OrderItem.exists({
    sanpham_id: pid,
    trangthai: { $nin: ['cancelled', 'dahuy'] }
  });
  if (daDuocMua) {
    return { ok: false, message: 'Sản phẩm đã có đơn hàng, không thể xóa' };
  }

  await Sanpham.findByIdAndUpdate(pid, { daxoa: true, ngaycapnhat: new Date() });
  return { ok: true, message: 'Xóa sản phẩm thành công!' };
}

async function doiTrangThaiSanPham(id, status) {
  await Sanpham.findByIdAndUpdate(id, { trangthai: status, ngaycapnhat: new Date() });
  return { ok: true };
}

module.exports = {
  getDanhSachData,
  khoiPhucSanPham,
  xoaVinhVienSanPham,
  getTaoMoiData,
  taoMoiSanPham,
  getChinhSuaData,
  capNhatSanPham,
  xoaMemSanPham,
  doiTrangThaiSanPham
};
