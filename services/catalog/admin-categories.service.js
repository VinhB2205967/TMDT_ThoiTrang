const mongoose = require('mongoose');
const Danhmuc = require('../../models/category_model');
const Sanpham = require('../../models/product_model');
const Brand = require('../../models/brand_model');
const { getCategoryTree, flattenTreeOptions } = require('./category.service.js');

const TYPE_ROOT_META = {
  category: { name: 'Loại sản phẩm', order: 10 },
  occasion: { name: 'Dịp sử dụng', order: 20 },
  age_group: { name: 'Nhóm tuổi', order: 30 },
  brand: { name: 'Thương hiệu', order: 40 }
};

function chuanHoaCayDanhMucChoAdmin(rawTree = []) {
  return (rawTree || [])
    .filter((node) => node.type !== 'gender')
    .map((node) => {
      const cloneNode = { ...node };
      const cleanChildren = (children = []) => children
        .filter((child) => child.type !== 'gender')
        .map((child) => ({ ...child, children: cleanChildren(child.children || []) }));
      cloneNode.children = cleanChildren(node.children || []);
      return cloneNode;
    });
}

function chuanPayload(body) {
  const name = String(body.name || body.tendanhmuc || '').trim();
  const slug = String(body.slug || '').trim();
  const allowedTypes = new Set(['category', 'brand', 'occasion', 'age_group']);
  const rawType = String(body.type || 'category').trim();
  const type = allowedTypes.has(rawType) ? rawType : 'category';
  const order = Number(body.order ?? body.thutu ?? 0);
  const isActive = body.isActive !== undefined
    ? String(body.isActive) === 'true' || body.isActive === true || body.isActive === '1'
    : !(String(body.trangthai || '').trim().toLowerCase() === 'inactive');

  const parentRaw = String(body.parent_id || body.danhmuccha || '').trim();
  const parent_id = parentRaw && mongoose.Types.ObjectId.isValid(parentRaw) ? parentRaw : null;

  return {
    name,
    tendanhmuc: name,
    slug,
    parent_id,
    danhmuccha: parent_id,
    type,
    order,
    thutu: order,
    isActive,
    trangthai: isActive ? 'active' : 'inactive',
    mota: String(body.mota || '').trim(),
    hinhanh: String(body.hinhanh || '').trim()
  };
}

function toOid(value) {
  return value && mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
}
// Lấy danh sách danh mục theo cây phân cấp
async function layThuTuCuoi({ parent_id, type, excludeId = null }) {
  const query = {
    daxoa: { $ne: true },
    type,
    parent_id: parent_id ? toOid(parent_id) : null,
    ...(excludeId ? { _id: { $ne: excludeId } } : {})
  };

  const lastItem = await Danhmuc.findOne(query)
    .sort({ order: -1, thutu: -1, _id: -1 })
    .select('order thutu')
    .lean();

  const currentMax = Number(lastItem?.order ?? lastItem?.thutu ?? -1);
  return currentMax + 1;
}

async function kiemTraTrungTen({ name, parent_id, type, excludeId = null }) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}$`, 'i');
  const query = {
    daxoa: { $ne: true },
    type,
    name: regex,
    parent_id: parent_id ? toOid(parent_id) : null,
    ...(excludeId ? { _id: { $ne: excludeId } } : {})
  };
  return Danhmuc.exists(query);
}

async function capNhatCayCon(parentId, parentMeta) {
  const children = await Danhmuc.find({
    daxoa: { $ne: true },
    parent_id: parentId
  }).select('_id slug').lean();

  for (const child of children) {
    const childPath = `${parentMeta.path || ''}/${child.slug || ''}`.replace(/\/+/, '/');
    const childAncestors = [...(parentMeta.ancestors || []), parentMeta._id];
    const childLevel = Number(parentMeta.level || 1) + 1;

    await Danhmuc.updateOne(
      { _id: child._id },
      {
        $set: {
          ancestors: childAncestors,
          level: childLevel,
          path: childPath
        }
      }
    );

    await capNhatCayCon(child._id, {
      _id: child._id,
      ancestors: childAncestors,
      level: childLevel,
      path: childPath
    });
  }
}

async function damBaoNhomTH() {
  const coThuongHieu = await Danhmuc.exists({ daxoa: { $ne: true }, type: 'brand' });
  if (coThuongHieu) return;

  await Danhmuc.create({
    name: 'Thương hiệu',
    tendanhmuc: 'Thương hiệu',
    type: 'brand',
    parent_id: null,
    danhmuccha: null,
    order: 0,
    thutu: 0,
    isActive: true,
    trangthai: 'active'
  });
}

async function layHoacTaoNhomGoc(type) {
  const selectedType = TYPE_ROOT_META[type] ? type : 'category';
  const existed = await Danhmuc.findOne({
    daxoa: { $ne: true },
    type: selectedType,
    parent_id: null
  }).sort({ order: 1, thutu: 1, _id: 1 });

  if (existed) return existed;

  const meta = TYPE_ROOT_META[selectedType] || TYPE_ROOT_META.category;
  return Danhmuc.create({
    name: meta.name,
    tendanhmuc: meta.name,
    type: selectedType,
    parent_id: null,
    danhmuccha: null,
    order: Number(meta.order || 0),
    thutu: Number(meta.order || 0),
    isActive: true,
    trangthai: 'active'
  });
}

async function damBaoDanhMucConMacDinh() {
  const categoryRoot = await layHoacTaoNhomGoc('category');
  if (!categoryRoot?._id) return;

  const defaultChildren = [
    { name: 'Áo', slug: 'ao', order: 1 },
    { name: 'Quần', slug: 'quan', order: 2 },
    { name: 'Váy', slug: 'vay', order: 3 },
    { name: 'Giày', slug: 'giay', order: 4 },
    { name: 'Túi', slug: 'tui', order: 5 },
    { name: 'Phụ kiện', slug: 'phukien', order: 6 }
  ];

  for (const item of defaultChildren) {
    const existed = await Danhmuc.findOne({
      daxoa: { $ne: true },
      type: 'category',
      parent_id: categoryRoot._id,
      $or: [
        { slug: item.slug },
        { name: item.name },
        { tendanhmuc: item.name }
      ]
    }).select('_id').lean();

    if (existed?._id) continue;

    await Danhmuc.create({
      name: item.name,
      tendanhmuc: item.name,
      slug: item.slug,
      type: 'category',
      parent_id: categoryRoot._id,
      danhmuccha: categoryRoot._id,
      order: item.order,
      thutu: item.order,
      isActive: true,
      trangthai: 'active',
      daxoa: false
    });
  }
}

async function damBaoNhomGoc() {
  for (const type of Object.keys(TYPE_ROOT_META)) {
    await layHoacTaoNhomGoc(type);
  }
  await damBaoDanhMucConMacDinh();
}

function slugTHTheoId(id) {
  return `brand-${String(id || '').trim()}`;
}

function layBrandIdTheoSlug(slug) {
  const raw = String(slug || '').trim();
  if (!raw.startsWith('brand-')) return null;
  const id = raw.slice(6);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function laDMThuongHieuCon(categoryDoc) {
  return categoryDoc && categoryDoc.type === 'brand' && Boolean(categoryDoc.parent_id);
}

async function dongBoDMSangBrand(categoryDoc) {
  if (!laDMThuongHieuCon(categoryDoc)) return;

  const mappedBrandId = layBrandIdTheoSlug(categoryDoc.slug);
  const payload = {
    ten: String(categoryDoc.name || categoryDoc.tendanhmuc || '').trim(),
    hienthi: Boolean(categoryDoc.isActive),
    thuTu: Number(categoryDoc.order || categoryDoc.thutu || 0)
  };

  if (!payload.ten) return;

  if (mappedBrandId) {
    await Brand.findByIdAndUpdate(mappedBrandId, {
      $set: {
        ...payload,
        daXoa: false,
        deletedAt: null
      }
    });
    return;
  }

  const existedByName = await Brand.findOne({ ten: payload.ten, daXoa: { $ne: true } }).select('_id').lean();
  if (existedByName?._id) {
    await Brand.findByIdAndUpdate(existedByName._id, { $set: payload });
    await Danhmuc.updateOne(
      { _id: categoryDoc._id },
      { $set: { slug: slugTHTheoId(existedByName._id) } }
    );
    return;
  }

  const createdBrand = await Brand.create({
    ...payload,
    logo: '/uploads/brands/default-brand.png',
    noiBat: false
  });

  await Danhmuc.updateOne(
    { _id: categoryDoc._id },
    { $set: { slug: slugTHTheoId(createdBrand._id) } }
  );
}

async function dongBoXoaDMSangBrand(categoryDoc) {
  if (!laDMThuongHieuCon(categoryDoc)) return;
  const mappedBrandId = layBrandIdTheoSlug(categoryDoc.slug);
  if (!mappedBrandId) return;
  await Brand.findByIdAndDelete(mappedBrandId);
}

async function dongBoTrangThaiDMSangBrand(categoryDoc, nextActive) {
  if (!laDMThuongHieuCon(categoryDoc)) return;
  const mappedBrandId = layBrandIdTheoSlug(categoryDoc.slug);
  if (!mappedBrandId) return;
  await Brand.findByIdAndUpdate(mappedBrandId, { $set: { hienthi: Boolean(nextActive) } });
}

async function dongBoTHVaoDM() {
  const root = await Danhmuc.findOne({
    daxoa: { $ne: true },
    type: 'brand',
    parent_id: null
  }).select('_id').lean();

  if (!root?._id) return;

  const danhSachThuongHieu = await Brand.find({ daXoa: { $ne: true } }).sort({ order: 1, thuTu: 1, ten: 1 }).lean();
  if (!danhSachThuongHieu.length) return;

  const brandCategoryDocs = await Danhmuc.find({
    daxoa: { $ne: true },
    type: 'brand',
    parent_id: root._id
  }).select('_id slug').lean();

  const brandSlugSet = new Set(brandCategoryDocs.map((item) => String(item.slug || '')));

  for (const thuongHieu of danhSachThuongHieu) {
    const slug = slugTHTheoId(thuongHieu._id);
    const ten = String(thuongHieu.ten || thuongHieu.name || '').trim();
    if (!ten) continue;

    const payload = {
      name: ten,
      tendanhmuc: ten,
      type: 'brand',
      parent_id: root._id,
      danhmuccha: root._id,
      order: Number(thuongHieu.order || thuongHieu.thuTu || 0),
      thutu: Number(thuongHieu.order || thuongHieu.thuTu || 0),
      isActive: Boolean(thuongHieu.hienthi || thuongHieu.isActive),
      trangthai: Boolean(thuongHieu.hienthi || thuongHieu.isActive) ? 'active' : 'inactive',
      daxoa: false
    };

    if (!brandSlugSet.has(slug)) {
      await Danhmuc.create({ ...payload, slug });
      continue;
    }

    await Danhmuc.updateOne({ slug, daxoa: { $ne: true } }, { $set: payload });
  }
}

async function layDanhSach(query = {}) {
  await damBaoNhomGoc();
  await damBaoNhomTH();
  await dongBoTHVaoDM();
  const rawTree = await getCategoryTree({ includeDeleted: false });
  const tree = chuanHoaCayDanhMucChoAdmin(rawTree);
  const parentOptions = flattenTreeOptions(tree);

  return {
    titlePage: 'Quản lý danh mục',
    tree,
    parentOptions,
    filters: {
      type: String(query.type || '').trim(),
      status: String(query.status || '').trim()
    }
  };
}

async function taoDM(body = {}) {
  const payload = chuanPayload(body);
  if (!payload.name) {
    return { ok: false, status: 400, message: 'Tên danh mục là bắt buộc' };
  }

  const rootByType = await layHoacTaoNhomGoc(payload.type);
  payload.parent_id = rootByType ? rootByType._id : null;
  payload.danhmuccha = payload.parent_id;

  const coNhapThuTu = body.order !== undefined || body.thutu !== undefined;
  if (!coNhapThuTu) {
    const nextOrder = await layThuTuCuoi({
      parent_id: payload.parent_id,
      type: payload.type
    });
    payload.order = nextOrder;
    payload.thutu = nextOrder;
  }

  const isDuplicated = await kiemTraTrungTen({
    name: payload.name,
    parent_id: payload.parent_id,
    type: payload.type
  });
  if (isDuplicated) {
    return { ok: false, status: 409, message: 'Tên danh mục đã tồn tại trong cùng cấp' };
  }

  const created = await Danhmuc.create(payload);
  await dongBoDMSangBrand(created);
  return { ok: true, status: 200, message: 'Tạo danh mục thành công', data: created };
}

async function capNhatDM(id, body = {}) {
  const categoryId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return { ok: false, status: 400, message: 'ID danh mục không hợp lệ' };
  }

  const doc = await Danhmuc.findOne({ _id: categoryId, daxoa: { $ne: true } }).lean();
  if (!doc) {
    return { ok: false, status: 404, message: 'Danh mục không tồn tại' };
  }

  if (!doc.parent_id) {
    return { ok: false, status: 400, message: 'Danh mục cha cố định, không thể sửa' };
  }

  const payload = chuanPayload(body);
  if (!payload.name) {
    return { ok: false, status: 400, message: 'Tên danh mục là bắt buộc' };
  }

  const isRootNode = !doc.parent_id;
  if (isRootNode) {
    payload.parent_id = null;
    payload.danhmuccha = null;
  } else {
    const rootByType = await layHoacTaoNhomGoc(payload.type);
    payload.parent_id = rootByType ? rootByType._id : null;
    payload.danhmuccha = payload.parent_id;
  }

  if (payload.parent_id && String(payload.parent_id) === categoryId) {
    return { ok: false, status: 400, message: 'Danh mục cha không hợp lệ' };
  }

  if (payload.parent_id) {
    const parentDoc = await Danhmuc.findOne({ _id: payload.parent_id, daxoa: { $ne: true } }).select('_id ancestors').lean();
    if (!parentDoc) {
      return { ok: false, status: 400, message: 'Danh mục cha không tồn tại' };
    }

    const parentAncestors = Array.isArray(parentDoc.ancestors) ? parentDoc.ancestors.map((x) => String(x)) : [];
    if (String(parentDoc._id) === categoryId || parentAncestors.includes(categoryId)) {
      return { ok: false, status: 400, message: 'Không thể chọn danh mục con làm danh mục cha' };
    }
  }

  const isDuplicated = await kiemTraTrungTen({
    name: payload.name,
    parent_id: payload.parent_id,
    type: payload.type,
    excludeId: categoryId
  });
  if (isDuplicated) {
    return { ok: false, status: 409, message: 'Tên danh mục đã tồn tại trong cùng cấp' };
  }

  await Danhmuc.findByIdAndUpdate(categoryId, payload, { runValidators: true });

  const updated = await Danhmuc.findById(categoryId).select('_id ancestors level path').lean();
  if (updated) await capNhatCayCon(updated._id, updated);
  const updatedFull = await Danhmuc.findById(categoryId).lean();
  await dongBoDMSangBrand(updatedFull);

  return { ok: true, status: 200, message: 'Cập nhật danh mục thành công' };
}

async function xoaDM(id) {
  const categoryId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return { ok: false, status: 400, message: 'ID danh mục không hợp lệ' };
  }

  const doc = await Danhmuc.findById(categoryId).lean();
  if (!doc) {
    return { ok: false, status: 404, message: 'Danh mục không tồn tại' };
  }

  const childCount = await Danhmuc.countDocuments({
    daxoa: { $ne: true },
    $or: [{ parent_id: categoryId }, { danhmuccha: categoryId }]
  });

  if (childCount > 0) {
    return { ok: false, status: 400, message: 'Không thể xóa danh mục cha đang có danh mục con' };
  }

  const usedByProducts = await Sanpham.countDocuments({
    daxoa: { $ne: true },
    $or: [{ category: categoryId }, { occasion: categoryId }, { occasions: categoryId }, { ageGroup: categoryId }, { loaisanpham: categoryId }]
  });

  if (usedByProducts > 0) {
    return { ok: false, status: 400, message: 'Không thể xóa danh mục đang được gán cho sản phẩm' };
  }

  await Danhmuc.findByIdAndUpdate(categoryId, { daxoa: true });
  await dongBoXoaDMSangBrand(doc);
  return { ok: true, status: 200, message: 'Đã xóa danh mục' };
}

async function doiTrangThaiDM(id) {
  const categoryId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return { ok: false, status: 400, message: 'ID danh mục không hợp lệ' };
  }

  const doc = await Danhmuc.findById(categoryId);
  if (!doc) {
    return { ok: false, status: 404, message: 'Danh mục không tồn tại' };
  }

  if (!doc.parent_id) {
    return {
      ok: false,
      status: 400,
      message: 'Danh mục cha cố định, không thể ẩn/hiện'
    };
  }

  const nextActive = !Boolean(doc.isActive);
  await Danhmuc.updateOne(
    { _id: categoryId },
    {
      $set: {
        isActive: nextActive,
        trangthai: nextActive ? 'active' : 'inactive'
      }
    }
  );
  await dongBoTrangThaiDMSangBrand(doc, nextActive);

  return {
    ok: true,
    status: 200,
    message: 'Đã cập nhật trạng thái hiển thị',
    data: { isActive: nextActive }
  };
}

async function sapXepDM(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, status: 400, message: 'Không có dữ liệu sắp xếp' };
  }

  const ops = items
    .filter((item) => mongoose.Types.ObjectId.isValid(item.id))
    .map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: {
          $set: {
            order: Number(item.order || 0),
            thutu: Number(item.order || 0)
          }
        }
      }
    }));

  if (ops.length) await Danhmuc.bulkWrite(ops);
  return { ok: true, status: 200, message: 'Đã cập nhật thứ tự danh mục' };
}

async function layCayJson(query = {}) {
  await damBaoNhomGoc();
  await damBaoNhomTH();
  await dongBoTHVaoDM();
  const type = String(query.type || '').trim();
  const activeOnly = String(query.active || '1') !== '0';
  const tree = chuanHoaCayDanhMucChoAdmin(await getCategoryTree({
    type: type || undefined,
    isActive: activeOnly ? true : undefined,
    includeDeleted: false
  }));
  return { ok: true, status: 200, data: tree };
}

module.exports = {
  layDanhSach,
  taoDM,
  capNhatDM,
  xoaDM,
  doiTrangThaiDM,
  sapXepDM,
  layCayJson
};

