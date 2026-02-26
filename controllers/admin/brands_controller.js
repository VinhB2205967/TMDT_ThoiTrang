const Brand = require('../../models/brand_model');
const Sanpham = require('../../models/product_model');
const mongoose = require('mongoose');

function laJSON(req) {
  const accept = String(req.get('accept') || '').toLowerCase();
  return req.xhr || accept.includes('application/json') || String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
}

function redirectVeBrands(req, res) {
  const referer = String(req.get('referer') || '').trim();
  if (referer && referer !== 'back' && !/\/back([/?#]|$)/i.test(referer)) {
    return res.redirect(referer);
  }
  return res.redirect('/admin/brands');
}

function parseBoolean(input, fallback = false) {
  if (input === undefined || input === null || input === '') return fallback;
  if (typeof input === 'boolean') return input;
  const raw = String(input).trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
}

async function kiemTraTrungTen(ten, excludeId = null) {
  const escaped = String(ten || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}$`, 'i');
  const query = {
    daXoa: { $ne: true },
    ten: regex,
    ...(excludeId ? { _id: { $ne: excludeId } } : {})
  };
  return Brand.exists(query);
}

function normalizePayload(req, { isCreate = false } = {}) {
  const ten = String(req.body.ten || req.body.name || '').trim();
  const logo = req.file?.filename ? `/uploads/brands/${req.file.filename}` : String(req.body.logo || '').trim();
  const moTa = String(req.body.moTa || req.body.description || '').trim();
  const payload = {
    ten,
    name: ten,
    description: moTa,
    moTa,
    isActive: parseBoolean(req.body.hienthi ?? req.body.isActive, true),
    hienthi: parseBoolean(req.body.hienthi ?? req.body.isActive, true),
    isFeatured: parseBoolean(req.body.noiBat ?? req.body.isFeatured, false),
    noiBat: parseBoolean(req.body.noiBat ?? req.body.isFeatured, false),
    order: Number(req.body.thuTu ?? req.body.order ?? 0),
    thuTu: Number(req.body.thuTu ?? req.body.order ?? 0)
  };

  if (logo) payload.logo = logo;
  if (!isCreate && !logo) delete payload.logo;
  return payload;
}

module.exports.danhSach = async (req, res) => {
  const data = await Brand.find({ daXoa: { $ne: true } }).sort({ order: 1, thuTu: 1, ten: 1 }).lean();
  const want = req.accepts(['html', 'json']);
  if (want === 'html') {
    return res.render('admin/pages/home/brands.pug', {
      titlePage: 'Quản lý Thương hiệu',
      brands: data
    });
  }
  return res.json({ success: true, data });
};

module.exports.taoMoi = async (req, res) => {
  try {
    const payload = normalizePayload(req, { isCreate: true });
    if (!payload.ten) {
      const message = 'Tên thương hiệu là bắt buộc';
      if (laJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }
    if (!payload.logo) {
      const message = 'Logo là bắt buộc';
      if (laJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    const trungTen = await kiemTraTrungTen(payload.ten);
    if (trungTen) {
      const message = 'Tên thương hiệu đã tồn tại';
      if (laJSON(req)) return res.status(409).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    const data = await Brand.create(payload);
    if (laJSON(req)) return res.json({ success: true, data, message: 'Tạo thương hiệu thành công' });
    req.flash('success', 'Tạo thương hiệu thành công');
    return redirectVeBrands(req, res);
  } catch (error) {
    const isDuplicate = error && (error.code === 11000 || String(error.message || '').includes('E11000'));
    const message = isDuplicate ? 'Tên thương hiệu đã tồn tại' : `Không thể tạo thương hiệu: ${error.message}`;
    if (laJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeBrands(req, res);
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const message = 'ID thương hiệu không hợp lệ';
      if (laJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    const exists = await Brand.findOne({ _id: id, daXoa: { $ne: true } }).lean();
    if (!exists) {
      const message = 'Thương hiệu không tồn tại';
      if (laJSON(req)) return res.status(404).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    const payload = normalizePayload(req, { isCreate: false });
    if (!payload.ten) {
      const message = 'Tên thương hiệu là bắt buộc';
      if (laJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    const trungTen = await kiemTraTrungTen(payload.ten, id);
    if (trungTen) {
      const message = 'Tên thương hiệu đã tồn tại';
      if (laJSON(req)) return res.status(409).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    const data = await Brand.findByIdAndUpdate(id, { $set: payload }, { new: true, runValidators: true });
    if (laJSON(req)) return res.json({ success: true, data, message: 'Cập nhật thương hiệu thành công' });
    req.flash('success', 'Cập nhật thương hiệu thành công');
    return redirectVeBrands(req, res);
  } catch (error) {
    const isDuplicate = error && (error.code === 11000 || String(error.message || '').includes('E11000'));
    const message = isDuplicate ? 'Tên thương hiệu đã tồn tại' : `Không thể cập nhật thương hiệu: ${error.message}`;
    if (laJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeBrands(req, res);
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const message = 'ID thương hiệu không hợp lệ';
      if (laJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    const brand = await Brand.findOne({ _id: id, daXoa: { $ne: true } }).lean();
    if (!brand) {
      const message = 'Thương hiệu không tồn tại';
      if (laJSON(req)) return res.status(404).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    const dangDuocSuDung = await Sanpham.countDocuments({
      daxoa: { $ne: true },
      $or: [{ brand: id }, { thuonghieu_id: id }]
    });

    if (dangDuocSuDung > 0) {
      const message = 'Không thể xóa thương hiệu đang có sản phẩm';
      if (laJSON(req)) return res.status(400).json({ success: false, message });
      req.flash('error', message);
      return redirectVeBrands(req, res);
    }

    await Brand.findByIdAndUpdate(id, {
      $set: {
        daXoa: true,
        deletedAt: new Date(),
        isActive: false,
        hienthi: false
      }
    });

    if (laJSON(req)) return res.json({ success: true, message: 'Đã xóa thương hiệu' });
    req.flash('success', 'Đã xóa thương hiệu');
    return redirectVeBrands(req, res);
  } catch (error) {
    const message = `Không thể xóa thương hiệu: ${error.message}`;
    if (laJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeBrands(req, res);
  }
};

module.exports.capNhatNoiBat = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });

    const data = await Brand.findOne({ _id: id, daXoa: { $ne: true } }).select('_id noiBat isFeatured').lean();
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy thương hiệu' });
    const next = req.body.noiBat !== undefined
      ? parseBoolean(req.body.noiBat, Boolean(data.noiBat || data.isFeatured))
      : !Boolean(data.noiBat || data.isFeatured);

    const updated = await Brand.findByIdAndUpdate(
      id,
      { $set: { noiBat: next, isFeatured: next } },
      { new: true }
    ).lean();

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports.capNhatHienThi = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });

    const data = await Brand.findOne({ _id: id, daXoa: { $ne: true } }).select('_id hienthi isActive').lean();
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy thương hiệu' });
    const next = req.body.hienthi !== undefined
      ? parseBoolean(req.body.hienthi, Boolean(data.hienthi || data.isActive))
      : !Boolean(data.hienthi || data.isActive);

    const updated = await Brand.findByIdAndUpdate(
      id,
      { $set: { hienthi: next, isActive: next } },
      { new: true }
    ).lean();

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const bulk = items
      .filter((item) => mongoose.Types.ObjectId.isValid(item.id))
      .map((item) => ({
        updateOne: {
          filter: { _id: item.id, daXoa: { $ne: true } },
          update: {
            $set: {
              thuTu: Number(item.thuTu || item.order || 0),
              order: Number(item.thuTu || item.order || 0)
            }
          }
        }
      }));

    if (bulk.length) await Brand.bulkWrite(bulk);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
