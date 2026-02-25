const Coupon = require('../../models/coupon_model');
const UserVoucher = require('../../models/user_voucher_model');
const SHIPPING_CONFIG = require('../../config/shipping');
const {
  normalizeCode,
  validateVoucherForOrder
} = require('../../services/voucher.service');

function isDateInRange(now, start, end) {
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function normalizeShippingRegion(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (SHIPPING_CONFIG.regions && SHIPPING_CONFIG.regions[key]) return key;
  return SHIPPING_CONFIG.defaultRegion || 'noithanh';
}

function calcShippingFee(subtotal, regionKey) {
  const total = Number(subtotal || 0);
  if (total >= Number(SHIPPING_CONFIG.freeShipThreshold || 0)) return 0;
  return Number(SHIPPING_CONFIG.regions?.[regionKey]?.fee || 0);
}

module.exports.index = async (req, res) => {
  res.render('client/pages/vouchers/index.pug', {
    titlePage: 'Voucher',
    shippingConfig: SHIPPING_CONFIG
  });
};

module.exports.available = async (req, res) => {
  try {
    const now = new Date();
    const vouchers = await Coupon.find({ daxoa: { $ne: true }, trangthai: 'active' })
      .sort({ ngaytao: -1 })
      .lean();

    const validVouchers = (vouchers || []).filter((v) => {
      if (!isDateInRange(now, v.ngay_batdau, v.ngay_ketthuc)) return false;
      if (v.soluong_toida != null && v.soluong_dasudung >= v.soluong_toida) return false;
      return true;
    });

    const userVouchers = await UserVoucher.find({ nguoidung_id: req.user._id }).lean();
    const savedMap = new Map((userVouchers || []).map((uv) => [String(uv.voucher_id), uv]));

    const data = validVouchers.map((v) => {
      const saved = savedMap.get(String(v._id));
      const remaining = v.soluong_toida != null
        ? Math.max(0, Number(v.soluong_toida || 0) - Number(v.soluong_dasudung || 0))
        : null;
      return {
        id: String(v._id),
        code: v.code,
        name: v.ten || 'Voucher',
        description: v.mota || '',
        type: v.loai,
        value: v.giatri,
        minOrderValue: v.don_toithieu || 0,
        maxDiscount: v.giam_toida || 0,
        remaining,
        endDate: v.ngay_ketthuc,
        banner: v.banner || '',
        isSaved: Boolean(saved),
        isUsed: Boolean(saved?.isUsed)
      };
    });

    res.json({ success: true, vouchers: data });
  } catch (error) {
    console.error('Load vouchers error:', error);
    res.status(500).json({ success: false, message: 'Không thể tải voucher' });
  }
};

module.exports.apply = async (req, res) => {
  try {
    const subtotal = Number(req.body?.subtotal || 0);
    const code = normalizeCode(req.body?.code || '');
    const shippingRegion = normalizeShippingRegion(req.body?.shippingRegion);
    const shippingFee = calcShippingFee(subtotal, shippingRegion);

    if (!code) {
      return res.json({
        success: true,
        discount: 0,
        shippingFee,
        total: Math.max(0, subtotal + shippingFee)
      });
    }

    const validation = await validateVoucherForOrder({
      code,
      userId: req.user._id,
      orderTotal: subtotal
    });

    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message || 'Voucher không hợp lệ' });
    }

    const discount = Math.min(Number(validation.discount || 0), subtotal);
    const total = Math.max(0, subtotal - discount + shippingFee);

    return res.json({
      success: true,
      discount,
      shippingFee,
      total,
      voucher: {
        id: String(validation.voucher._id),
        code: validation.voucher.code,
        type: validation.voucher.loai,
        value: validation.voucher.giatri
      }
    });
  } catch (error) {
    console.error('Apply voucher error:', error);
    return res.status(500).json({ success: false, message: 'Không thể áp dụng voucher' });
  }
};

module.exports.save = async (req, res) => {
  try {
    const code = normalizeCode(req.body?.code || req.query?.code);
    if (!code) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mã voucher' });
    }

    const voucher = await Coupon.findOne({ code, daxoa: { $ne: true } }).select('_id').lean();
    if (!voucher) {
      return res.status(404).json({ success: false, message: 'Voucher không tồn tại' });
    }

    await UserVoucher.findOneAndUpdate(
      { nguoidung_id: req.user._id, voucher_id: voucher._id },
      { $setOnInsert: { isUsed: false, savedAt: new Date() } },
      { upsert: true, new: true }
    );

    return res.json({ success: true, message: 'Đã lưu voucher' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Không thể lưu voucher' });
  }
};
