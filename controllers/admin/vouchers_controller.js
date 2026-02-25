const Coupon = require('../../models/coupon_model');

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function parseNumber(raw, fallback = 0) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function redirectBack(req, res) {
  const fallback = req.app?.locals?.admin ? `${req.app.locals.admin}/vouchers/create` : '/admin/vouchers/create';
  return res.redirect(req.get('Referrer') || fallback);
}

function toInputDate(d) {
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports.danhSach = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 10;
    const skip = (page - 1) * limit;

    const filter = { daxoa: { $ne: true } };
    if (keyword) {
      const regex = new RegExp(keyword, 'i');
      filter.$or = [{ code: regex }, { ten: regex }];
    }

    const total = await Coupon.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const vouchers = await Coupon.find(filter)
      .sort({ ngaytao: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.render('admin/pages/vouchers/index.pug', {
      titlePage: 'Voucher',
      vouchers: vouchers || [],
      keyword,
      page,
      totalPages,
      total
    });
  } catch (error) {
    console.error('Load vouchers error:', error);
    res.status(500).send('Không thể tải danh sách voucher');
  }
};

module.exports.toggleStatus = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const voucher = await Coupon.findById(id);
    if (!voucher) {
      req.flash?.('error', 'Không tìm thấy voucher');
      return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers`);
    }

    voucher.trangthai = voucher.trangthai === 'active' ? 'inactive' : 'active';
    await voucher.save();
    req.flash?.('success', `Đã cập nhật trạng thái ${voucher.code}`);
    return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers`);
  } catch (error) {
    console.error('Toggle voucher status error:', error);
    req.flash?.('error', 'Không thể cập nhật trạng thái voucher');
    return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers`);
  }
};

module.exports.taoMoi = async (req, res) => {
  const now = new Date();
  const nextMonth = new Date(now.getTime());
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  res.render('admin/pages/vouchers/create.pug', {
    titlePage: 'Tạo voucher',
    defaultStart: toInputDate(now),
    defaultEnd: toInputDate(nextMonth)
  });
};

module.exports.sua = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const voucher = await Coupon.findById(id).lean();
    if (!voucher) {
      req.flash?.('error', 'Không tìm thấy voucher');
      return res.redirect(req.app.locals.admin + '/vouchers');
    }

    res.render('admin/pages/vouchers/edit.pug', {
      titlePage: 'Chỉnh sửa voucher',
      voucher,
      defaultStart: toInputDate(voucher.ngay_batdau || voucher.ngaytao || new Date()),
      defaultEnd: toInputDate(voucher.ngay_ketthuc || new Date())
    });
  } catch (error) {
    console.error('Load voucher edit error:', error);
    req.flash?.('error', 'Không thể tải voucher');
    return res.redirect(req.app.locals.admin + '/vouchers');
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const voucher = await Coupon.findById(id);
    if (!voucher) {
      req.flash?.('error', 'Không tìm thấy voucher');
      return res.redirect(req.app.locals.admin + '/vouchers');
    }

    const code = normalizeCode(req.body.code);
    const ten = String(req.body.ten || '').trim();
    const mota = String(req.body.mota || '').trim();
    const loai = String(req.body.loai || '').trim();
    const giatri = parseNumber(req.body.giatri, 0);
    const don_toithieu = parseNumber(req.body.don_toithieu, 0);
    const giam_toida = parseNumber(req.body.giam_toida, 0);
    const soluong_toida = parseNumber(req.body.soluong_toida, 0);
    const ngay_batdau = parseDate(req.body.ngay_batdau) || voucher.ngay_batdau || new Date();
    const ngay_ketthuc = parseDate(req.body.ngay_ketthuc) || voucher.ngay_ketthuc;
    const trangthai = String(req.body.trangthai || 'active');

    if (!code) {
      req.flash('error', 'Vui lòng nhập mã voucher');
      return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers/${id}/edit`);
    }

    if (!loai || !['phantram', 'tientruc_tiep'].includes(loai)) {
      req.flash('error', 'Loại voucher không hợp lệ');
      return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers/${id}/edit`);
    }

    if (!Number.isFinite(giatri) || giatri <= 0) {
      req.flash('error', 'Giá trị voucher không hợp lệ');
      return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers/${id}/edit`);
    }

    if (!ngay_ketthuc) {
      req.flash('error', 'Vui lòng chọn ngày kết thúc');
      return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers/${id}/edit`);
    }

    if (code !== voucher.code) {
      const existed = await Coupon.findOne({ code }).select('_id').lean();
      if (existed) {
        req.flash('error', 'Mã voucher đã tồn tại');
        return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers/${id}/edit`);
      }
    }

    const banner = req.file?.filename ? `/uploads/vouchers/${req.file.filename}` : voucher.banner || '';

    voucher.code = code;
    voucher.ten = ten;
    voucher.mota = mota;
    voucher.banner = banner;
    voucher.loai = loai;
    voucher.giatri = giatri;
    voucher.don_toithieu = don_toithieu;
    voucher.giam_toida = loai === 'phantram' ? giam_toida : undefined;
    voucher.soluong_toida = soluong_toida > 0 ? soluong_toida : 0;
    voucher.ngay_batdau = ngay_batdau;
    voucher.ngay_ketthuc = ngay_ketthuc;
    voucher.trangthai = trangthai === 'inactive' ? 'inactive' : 'active';

    await voucher.save();

    req.flash('success', `Đã cập nhật voucher ${voucher.code}`);
    return res.redirect(req.app.locals.admin + '/vouchers');
  } catch (error) {
    console.error('Update voucher error:', error);
    req.flash('error', 'Không thể cập nhật voucher: ' + error.message);
    return res.redirect(req.get('Referrer') || `${req.app.locals.admin}/vouchers`);
  }
};

module.exports.taoMoiPost = async (req, res) => {
  try {
    const code = normalizeCode(req.body.code);
    const ten = String(req.body.ten || '').trim();
    const mota = String(req.body.mota || '').trim();
    const loai = String(req.body.loai || '').trim();
    const giatri = parseNumber(req.body.giatri, 0);
    const don_toithieu = parseNumber(req.body.don_toithieu, 0);
    const giam_toida = parseNumber(req.body.giam_toida, 0);
    const soluong_toida = parseNumber(req.body.soluong_toida, 0);
    const ngay_batdau = parseDate(req.body.ngay_batdau) || new Date();
    const ngay_ketthuc = parseDate(req.body.ngay_ketthuc);
    const trangthai = String(req.body.trangthai || 'active');

    if (!code) {
      req.flash('error', 'Vui lòng nhập mã voucher');
      return redirectBack(req, res);
    }

    if (!loai || !['phantram', 'tientruc_tiep'].includes(loai)) {
      req.flash('error', 'Loại voucher không hợp lệ');
      return redirectBack(req, res);
    }

    if (!Number.isFinite(giatri) || giatri <= 0) {
      req.flash('error', 'Giá trị voucher không hợp lệ');
      return redirectBack(req, res);
    }

    if (!ngay_ketthuc) {
      req.flash('error', 'Vui lòng chọn ngày kết thúc');
      return redirectBack(req, res);
    }

    const existed = await Coupon.findOne({ code }).select('_id').lean();
    if (existed) {
      req.flash('error', 'Mã voucher đã tồn tại');
      return redirectBack(req, res);
    }

    const banner = req.file?.filename ? `/uploads/vouchers/${req.file.filename}` : '';

    const voucher = await Coupon.create({
      code,
      ten,
      mota,
      banner,
      loai,
      giatri,
      don_toithieu,
      giam_toida: loai === 'phantram' ? giam_toida : undefined,
      soluong_toida: soluong_toida > 0 ? soluong_toida : 0,
      soluong_dasudung: 0,
      ngay_batdau,
      ngay_ketthuc,
      trangthai: trangthai === 'inactive' ? 'inactive' : 'active'
    });

    req.flash('success', `Đã tạo voucher ${voucher.code}`);
    return res.redirect(req.app.locals.admin + '/vouchers');
  } catch (error) {
    console.error('Create voucher error:', error);
    req.flash('error', 'Không thể tạo voucher: ' + error.message);
    return redirectBack(req, res);
  }
};
