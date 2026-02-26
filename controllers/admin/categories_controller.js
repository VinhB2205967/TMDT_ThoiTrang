 const mongoose = require('mongoose');
const Danhmuc = require('../../models/category_model');
const Sanpham = require('../../models/product_model');
const Brand = require('../../models/brand_model');
const { getCategoryTree, flattenTreeOptions } = require('../../services/category.service');

function muonJSON(req) {
  const accept = String(req.get('accept') || '').toLowerCase();
  return req.xhr || accept.includes('application/json') || String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
}

function redirectVeDanhMuc(req, res) {
  const referer = String(req.get('referer') || '').trim();
  if (referer && referer !== 'back' && !/\/back([/?#]|$)/i.test(referer)) {
    return res.redirect(referer);
  }
  return res.redirect('/admin/categories');
}

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
    const childPath = `${parentMeta.path || ''}/${child.slug || ''}`.replace(/\/+/g, '/');
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
    await Brand.findByIdAndUpdate(mappedBrandId, { $set: payload });
    return;
  }

  const existedByName = await Brand.findOne({ ten: payload.ten }).select('_id').lean();
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

  const danhSachThuongHieu = await Brand.find({}).sort({ thuTu: 1, ten: 1 }).lean();
  if (!danhSachThuongHieu.length) return;

  const brandCategoryDocs = await Danhmuc.find({
    daxoa: { $ne: true },
    type: 'brand',
    parent_id: root._id
  }).select('_id slug').lean();

  const brandSlugSet = new Set(brandCategoryDocs.map((item) => String(item.slug || '')));

  for (const thuongHieu of danhSachThuongHieu) {
    const slug = slugThuongHieuTheoId(thuongHieu._id);
    const ten = String(thuongHieu.ten || '').trim();
    if (!ten) continue;

    const payload = {
      name: ten,
      tendanhmuc: ten,
      type: 'brand',
      parent_id: root._id,
      danhmuccha: root._id,
      order: Number(thuongHieu.thuTu || 0),
      thutu: Number(thuongHieu.thuTu || 0),
      isActive: Boolean(thuongHieu.hienthi),
      trangthai: Boolean(thuongHieu.hienthi) ? 'active' : 'inactive',
      daxoa: false
    };

    if (!brandSlugSet.has(slug)) {
      await Danhmuc.create({ ...payload, slug });
      continue;
    }

    await Danhmuc.updateOne({ slug, daxoa: { $ne: true } }, { $set: payload });
  }
}

module.exports.danhSach = async (req, res) => {
  await damBaoNhomThuongHieu();
  await dongBoThuongHieuVaoDanhMuc();
  const tree = await getCategoryTree({ includeDeleted: false });
  const parentOptions = flattenTreeOptions(tree);

  res.render('admin/pages/categories/index.pug', {
    titlePage: 'Quản lý danh mục',
    tree,
    parentOptions,
    filters: {
      type: String(req.query.type || '').trim(),
      status: String(req.query.status || '').trim()
    }
  });
};

module.exports.taoMoi = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    if (!payload.name) {
      req.flash('error', 'Tên danh mục là bắt buộc');
      return redirectVeDanhMuc(req, res);
    }

    const isDuplicated = await kiemTraTrungTenCungCap({
      name: payload.name,
      parent_id: payload.parent_id,
      type: payload.type
    });
    if (isDuplicated) {
      const message = 'Tên danh mục đã tồn tại trong cùng cấp';
      if (muonJSON(req)) return res.status(409).json({ success: false, message });
      req.flash('error', message);
      return redirectVeDanhMuc(req, res);
    }

    const created = await Danhmuc.create(payload);
    await dongBoDanhMucSangBrand(created);
    const message = 'Tạo danh mục thành công';
    if (muonJSON(req)) return res.json({ success: true, data: created, message });
    req.flash('success', message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    const message = `Không thể tạo danh mục: ${error.message}`;
    if (muonJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID danh mục không hợp lệ');
      return redirectVeDanhMuc(req, res);
    }

    const doc = await Danhmuc.findOne({ _id: id, daxoa: { $ne: true } }).lean();
    if (!doc) {
      const message = 'Danh mục không tồn tại';
      if (muonJSON(req)) return res.status(404).json({ success: false, message });
      req.flash('error', message);
      return redirectVeDanhMuc(req, res);
    }

    const payload = normalizePayload(req.body);
    if (!payload.name) {
      req.flash('error', 'Tên danh mục là bắt buộc');
      return redirectVeDanhMuc(req, res);
    }

    if (payload.parent_id && String(payload.parent_id) === id) {
      const message = 'Danh mục cha không hợp lệ';
      if (muonJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeDanhMuc(req, res);
    }

    if (payload.parent_id) {
      const parentDoc = await Danhmuc.findOne({ _id: payload.parent_id, daxoa: { $ne: true } }).select('_id ancestors').lean();
      if (!parentDoc) {
        const message = 'Danh mục cha không tồn tại';
        if (muonJSON(req)) return res.status(400).json({ success: false, message });
        req.flash('error', message);
        return redirectVeDanhMuc(req, res);
      }

      const parentAncestors = Array.isArray(parentDoc.ancestors) ? parentDoc.ancestors.map((x) => String(x)) : [];
      if (String(parentDoc._id) === id || parentAncestors.includes(id)) {
        const message = 'Không thể chọn danh mục con làm danh mục cha';
        if (muonJSON(req)) return res.status(400).json({ success: false, message });
        req.flash('error', message);
        return redirectVeDanhMuc(req, res);
      }
    }

    const isDuplicated = await kiemTraTrungTenCungCap({
      name: payload.name,
      parent_id: payload.parent_id,
      type: payload.type,
      excludeId: id
    });
    if (isDuplicated) {
      const message = 'Tên danh mục đã tồn tại trong cùng cấp';
      if (muonJSON(req)) return res.status(409).json({ success: false, message });
      req.flash('error', message);
      return redirectVeDanhMuc(req, res);
    }

    await Danhmuc.findByIdAndUpdate(id, payload, { runValidators: true });

    const updated = await Danhmuc.findById(id).select('_id ancestors level path').lean();
    if (updated) await capNhatNhanhCayCon(updated._id, updated);
    const updatedFull = await Danhmuc.findById(id).lean();
    await dongBoDanhMucSangBrand(updatedFull);

    const message = 'Cập nhật danh mục thành công';
    if (muonJSON(req)) return res.json({ success: true, message });
    req.flash('success', message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    const message = `Không thể cập nhật danh mục: ${error.message}`;
    if (muonJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'ID danh mục không hợp lệ');
      return redirectVeDanhMuc(req, res);
    }

    const doc = await Danhmuc.findById(id).lean();
    if (!doc) {
      req.flash('error', 'Danh mục không tồn tại');
      return redirectVeDanhMuc(req, res);
    }

    const childCount = await Danhmuc.countDocuments({
      daxoa: { $ne: true },
      $or: [{ parent_id: id }, { danhmuccha: id }]
    });

    if (childCount > 0) {
      const message = 'Không thể xóa danh mục cha đang có danh mục con';
      if (muonJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeDanhMuc(req, res);
    }

    const usedByProducts = await Sanpham.countDocuments({
      daxoa: { $ne: true },
      $or: [{ category: id }, { occasion: id }, { ageGroup: id }, { loaisanpham: id }]
    });

    if (usedByProducts > 0) {
      const message = 'Không thể xóa danh mục đang được gán cho sản phẩm';
      if (muonJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeDanhMuc(req, res);
    }

    await Danhmuc.findByIdAndUpdate(id, { daxoa: true });
    await dongBoXoaDanhMucSangBrand(doc);
    const message = 'Đã xóa danh mục';
    if (muonJSON(req)) return res.json({ success: true, message });
    req.flash('success', message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    const message = `Không thể xóa danh mục: ${error.message}`;
    if (muonJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.doiTrangThai = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const message = 'ID danh mục không hợp lệ';
      if (muonJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeDanhMuc(req, res);
    }

    const doc = await Danhmuc.findById(id);
    if (!doc) {
      const message = 'Danh mục không tồn tại';
      if (muonJSON(req)) return res.status(404).json({ success: false, message });
      req.flash('error', message);
      return redirectVeDanhMuc(req, res);
    }

    const nextActive = !Boolean(doc.isActive);
    await Danhmuc.updateOne(
      { _id: id },
      {
        $set: {
          isActive: nextActive,
          trangthai: nextActive ? 'active' : 'inactive'
        }
      }
    );
    await dongBoTrangThaiDanhMucSangBrand(doc, nextActive);

    const message = 'Đã cập nhật trạng thái hiển thị';
    if (muonJSON(req)) return res.json({ success: true, message, isActive: nextActive });
    req.flash('success', message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    const message = `Không thể cập nhật trạng thái: ${error.message}`;
    if (muonJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      req.flash('error', 'Không có dữ liệu sắp xếp');
      return redirectVeDanhMuc(req, res);
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
    req.flash('success', 'Đã cập nhật thứ tự danh mục');
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    req.flash('error', `Không thể sắp xếp danh mục: ${error.message}`);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.treeJson = async (req, res) => {
  const type = String(req.query.type || '').trim();
  const activeOnly = String(req.query.active || '1') !== '0';
  const tree = await getCategoryTree({ type: type || undefined, isActive: activeOnly ? true : undefined, includeDeleted: false });
  res.json({ success: true, data: tree });
};
