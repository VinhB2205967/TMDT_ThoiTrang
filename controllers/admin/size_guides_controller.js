const mongoose = require('mongoose');
const SizeGuide = require('../../models/size_guide_model');
const {
  slugify,
  parseColumns,
  parseRows,
  rowsToTextarea,
  ensureDefaultSizeGuides
} = require('../../services/sizeGuide.service');

function loaiSanPhamOptions() {
  return [
    { value: 'ao', label: 'Áo / Váy / Áo khoác' },
    { value: 'quan', label: 'Quần' },
    { value: 'giay', label: 'Giày dép' }
  ];
}

const danhSach = async (req, res) => {
  try {
    await ensureDefaultSizeGuides(SizeGuide);
    const guides = await SizeGuide.find({ daxoa: { $ne: true } })
      .sort({ loaisanpham: 1, ngaycapnhat: -1 })
      .lean();

    return res.render('admin/pages/size-guides/index.pug', {
      titlePage: 'Bảng hướng dẫn size',
      guides
    });
  } catch (error) {
    console.error('Load size guides error:', error);
    return res.status(500).send('Không tải được danh sách bảng size');
  }
};

const taoMoi = async (req, res) => {
  return res.render('admin/pages/size-guides/create.pug', {
    titlePage: 'Thêm bảng hướng dẫn size',
    loaiOptions: loaiSanPhamOptions()
  });
};

const taoMoiPost = async (req, res) => {
  try {
    const tenbang = String(req.body.tenbang || '').trim();
    const loaisanpham = String(req.body.loaisanpham || '').trim();
    const cot = parseColumns(req.body.cot);
    const dong = parseRows(req.body.dong, cot.length);
    const goiy = String(req.body.goiy || '').trim();

    if (!tenbang) throw new Error('Tên bảng size là bắt buộc');
    if (!loaisanpham) throw new Error('Loại sản phẩm áp dụng là bắt buộc');
    if (!cot.length) throw new Error('Cần ít nhất 1 cột kích thước');
    if (!dong.length) throw new Error('Cần ít nhất 1 dòng size');

    const baseSlug = slugify(req.body.slug || tenbang);
    let slug = baseSlug;
    let suffix = 1;

    // Ensure slug uniqueness for active guides.
    // eslint-disable-next-line no-await-in-loop
    while (await SizeGuide.findOne({ slug, daxoa: { $ne: true } }).select('_id').lean()) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    await SizeGuide.create({
      tenbang,
      slug,
      loaisanpham,
      cot,
      dong,
      goiy,
      daxoa: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    req.flash('success', 'Đã tạo bảng hướng dẫn size');
    return res.redirect(req.app.locals.admin + '/size-guides');
  } catch (error) {
    console.error('Create size guide error:', error);
    req.flash('error', 'Không thể tạo bảng size: ' + error.message);
    return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/size-guides/create'));
  }
};

const chinhSua = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).send('Không tìm thấy bảng size');

    const guide = await SizeGuide.findOne({ _id: id, daxoa: { $ne: true } }).lean();
    if (!guide) return res.status(404).send('Không tìm thấy bảng size');

    const guideForm = {
      ...guide,
      cotText: (guide.cot || []).join(', '),
      dongText: rowsToTextarea(guide.dong)
    };

    return res.render('admin/pages/size-guides/edit.pug', {
      titlePage: 'Chỉnh sửa bảng hướng dẫn size',
      guide: guideForm,
      loaiOptions: loaiSanPhamOptions()
    });
  } catch (error) {
    console.error('Edit size guide page error:', error);
    return res.status(500).send('Không thể tải trang chỉnh sửa bảng size');
  }
};

const chinhSuaPost = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('ID bảng size không hợp lệ');

    const guide = await SizeGuide.findOne({ _id: id, daxoa: { $ne: true } });
    if (!guide) throw new Error('Không tìm thấy bảng size');

    const tenbang = String(req.body.tenbang || '').trim();
    const loaisanpham = String(req.body.loaisanpham || '').trim();
    const cot = parseColumns(req.body.cot);
    const dong = parseRows(req.body.dong, cot.length);
    const goiy = String(req.body.goiy || '').trim();

    if (!tenbang) throw new Error('Tên bảng size là bắt buộc');
    if (!loaisanpham) throw new Error('Loại sản phẩm áp dụng là bắt buộc');
    if (!cot.length) throw new Error('Cần ít nhất 1 cột kích thước');
    if (!dong.length) throw new Error('Cần ít nhất 1 dòng size');

    let slug = String(req.body.slug || guide.slug || tenbang).trim();
    slug = slugify(slug);

    const existed = await SizeGuide.findOne({ _id: { $ne: guide._id }, slug, daxoa: { $ne: true } }).select('_id').lean();
    if (existed?._id) throw new Error('Slug đã tồn tại, vui lòng đổi tên/slug');

    guide.tenbang = tenbang;
    guide.slug = slug;
    guide.loaisanpham = loaisanpham;
    guide.cot = cot;
    guide.dong = dong;
    guide.goiy = goiy;
    guide.ngaycapnhat = new Date();
    await guide.save();

    req.flash('success', 'Đã cập nhật bảng hướng dẫn size');
    return res.redirect(req.app.locals.admin + '/size-guides');
  } catch (error) {
    console.error('Update size guide error:', error);
    req.flash('error', 'Không thể cập nhật bảng size: ' + error.message);
    return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/size-guides'));
  }
};

const xoa = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('ID bảng size không hợp lệ');

    const guide = await SizeGuide.findOne({ _id: id, daxoa: { $ne: true } });
    if (!guide) throw new Error('Không tìm thấy bảng size');

    guide.daxoa = true;
    guide.ngaycapnhat = new Date();
    await guide.save();

    req.flash('success', 'Đã xóa bảng hướng dẫn size');
    return res.redirect(req.app.locals.admin + '/size-guides');
  } catch (error) {
    console.error('Delete size guide error:', error);
    req.flash('error', 'Không thể xóa bảng size: ' + error.message);
    return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/size-guides'));
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chinhSua,
  chinhSuaPost,
  xoa
};
