const mongoose = require('mongoose');
const Danhmuc = require('../../models/category_model');
const Sanpham = require('../../models/product_model');
const Brand = require('../../models/brand_model');
const { getCategoryTree, flattenTreeOptions } = require('./category.service.js');

function normalizePayload(body) {
  const name = String(body.name || body.tendanhmuc || '').trim();
  const slug = String(body.slug || '').trim();
  const allowedTypes = new Set(['category', 'brand', 'occasion', 'age_group', 'gender']);
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

function toObjectIdOrNull(value) {
  return value && mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
}

async function kiemTraTrungTenCungCap({ name, parent_id, type, excludeId = null }) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}$`, 'i');
  const query = {
    daxoa: { $ne: true },
    type,
    name: regex,
    parent_id: parent_id ? toObjectIdOrNull(parent_id) : null,
    ...(excludeId ? { _id: { $ne: excludeId } } : {})
  };
  return Danhmuc.exists(query);
}

async function capNhatNhanhCayCon(parentId, parentMeta) {
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

    await capNhatNhanhCayCon(child._id, {
      _id: child._id,
      ancestors: childAncestors,
      level: childLevel,
      path: childPath
    });
  }
}

async function damBaoNhomThuongHieu() {
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

function slugThuongHieuTheoId(id) {
  return `brand-${String(id || '').trim()}`;
}

function layBrandIdTuSlug(slug) {
  const raw = String(slug || '').trim();
  if (!raw.startsWith('brand-')) return null;
  const id = raw.slice(6);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function laDanhMucThuongHieuCon(categoryDoc) {
  return categoryDoc && categoryDoc.type === 'brand' && Boolean(categoryDoc.parent_id);
}

async function dongBoDanhMucSangBrand(categoryDoc) {
  if (!laDanhMucThuongHieuCon(categoryDoc)) return;

  const mappedBrandId = layBrandIdTuSlug(categoryDoc.slug);
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
      { $set: { slug: slugThuongHieuTheoId(existedByName._id) } }
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
    { $set: { slug: slugThuongHieuTheoId(createdBrand._id) } }
  );
}

async function dongBoXoaDanhMucSangBrand(categoryDoc) {
  if (!laDanhMucThuongHieuCon(categoryDoc)) return;
  const mappedBrandId = layBrandIdTuSlug(categoryDoc.slug);
  if (!mappedBrandId) return;
  await Brand.findByIdAndDelete(mappedBrandId);
}

async function dongBoTrangThaiDanhMucSangBrand(categoryDoc, nextActive) {
  if (!laDanhMucThuongHieuCon(categoryDoc)) return;
  const mappedBrandId = layBrandIdTuSlug(categoryDoc.slug);
  if (!mappedBrandId) return;
  await Brand.findByIdAndUpdate(mappedBrandId, { $set: { hienthi: Boolean(nextActive) } });
}

async function dongBoThuongHieuVaoDanhMuc() {
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
    const slug = slugThuongHieuTheoId(thuongHieu._id);
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

async function getDanhSachData(query = {}) {
  await damBaoNhomThuongHieu();
  await dongBoThuongHieuVaoDanhMuc();
  const tree = await getCategoryTree({ includeDeleted: false });
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

async function taoDanhMuc(body = {}) {
  const payload = normalizePayload(body);
  if (!payload.name) {
    return { ok: false, status: 400, message: 'Tên danh mục là bắt buộc' };
  }

  const isDuplicated = await kiemTraTrungTenCungCap({
    name: payload.name,
    parent_id: payload.parent_id,
    type: payload.type
  });
  if (isDuplicated) {
    return { ok: false, status: 409, message: 'Tên danh mục đã tồn tại trong cùng cấp' };
  }

  const created = await Danhmuc.create(payload);
  await dongBoDanhMucSangBrand(created);
  return { ok: true, status: 200, message: 'Tạo danh mục thành công', data: created };
}

async function capNhatDanhMuc(id, body = {}) {
  const categoryId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return { ok: false, status: 400, message: 'ID danh mục không hợp lệ' };
  }

  const doc = await Danhmuc.findOne({ _id: categoryId, daxoa: { $ne: true } }).lean();
  if (!doc) {
    return { ok: false, status: 404, message: 'Danh mục không tồn tại' };
  }

  const payload = normalizePayload(body);
  if (!payload.name) {
    return { ok: false, status: 400, message: 'Tên danh mục là bắt buộc' };
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

  const isDuplicated = await kiemTraTrungTenCungCap({
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
  if (updated) await capNhatNhanhCayCon(updated._id, updated);
  const updatedFull = await Danhmuc.findById(categoryId).lean();
  await dongBoDanhMucSangBrand(updatedFull);

  return { ok: true, status: 200, message: 'Cập nhật danh mục thành công' };
}

async function xoaDanhMuc(id) {
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
    $or: [{ category: categoryId }, { occasion: categoryId }, { ageGroup: categoryId }, { loaisanpham: categoryId }]
  });

  if (usedByProducts > 0) {
    return { ok: false, status: 400, message: 'Không thể xóa danh mục đang được gán cho sản phẩm' };
  }

  await Danhmuc.findByIdAndUpdate(categoryId, { daxoa: true });
  await dongBoXoaDanhMucSangBrand(doc);
  return { ok: true, status: 200, message: 'Đã xóa danh mục' };
}

async function doiTrangThaiDanhMuc(id) {
  const categoryId = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return { ok: false, status: 400, message: 'ID danh mục không hợp lệ' };
  }

  const doc = await Danhmuc.findById(categoryId);
  if (!doc) {
    return { ok: false, status: 404, message: 'Danh mục không tồn tại' };
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
  await dongBoTrangThaiDanhMucSangBrand(doc, nextActive);

  return {
    ok: true,
    status: 200,
    message: 'Đã cập nhật trạng thái hiển thị',
    data: { isActive: nextActive }
  };
}

async function sapXepDanhMuc(items = []) {
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

async function getTreeJsonData(query = {}) {
  const type = String(query.type || '').trim();
  const activeOnly = String(query.active || '1') !== '0';
  const tree = await getCategoryTree({
    type: type || undefined,
    isActive: activeOnly ? true : undefined,
    includeDeleted: false
  });
  return { ok: true, status: 200, data: tree };
}

module.exports = {
  getDanhSachData,
  taoDanhMuc,
  capNhatDanhMuc,
  xoaDanhMuc,
  doiTrangThaiDanhMuc,
  sapXepDanhMuc,
  getTreeJsonData
};
