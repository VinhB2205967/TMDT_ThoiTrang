const Coupon = require('../../../models/coupon_model');
const UserVoucher = require('../../../models/user_voucher_model');
const SHIPPING_CONFIG = require('../../../config/shipping');
const { normalizeCode, validateVoucherForOrder } = require('../../../services/voucher.service');

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
  return Number(SHIPPING_CONFIG.regions && SHIPPING_CONFIG.regions[regionKey] ? SHIPPING_CONFIG.regions[regionKey].fee : 0);
}

module.exports.listAvailable = async (req, res) => {
  try {
    const now = new Date();
    const vouchers = await Coupon.find({ daxoa: { $ne: true }, trangthai: 'active' }).sort({ ngaytao: -1 }).lean();
    const validVouchers = (vouchers || []).filter((v) => {
      if (!isDateInRange(now, v.ngay_batdau, v.ngay_ketthuc)) return false;
      if (v.soluong_toida != null && Number(v.soluong_dasudung || 0) >= Number(v.soluong_toida || 0)) return false;
      return true;
    });

    const userVouchers = await UserVoucher.find({ nguoidung_id: req.user._id }).lean();
    const savedMap = new Map((userVouchers || []).map((uv) => [String(uv.voucher_id), uv]));

    const items = validVouchers.map((v) => {
      const saved = savedMap.get(String(v._id));
      const remaining = v.soluong_toida != null
        ? Math.max(0, Number(v.soluong_toida || 0) - Number(v.soluong_dasudung || 0))
        : null;
      return {
        id: String(v._id),
        code: String(v.code || ''),
        name: String(v.ten || 'Voucher'),
        description: String(v.mota || ''),
        type: String(v.loai || ''),
        value: Number(v.giatri || 0),
        minOrderValue: Number(v.don_toithieu || 0),
        maxDiscount: Number(v.giam_toida || 0),
        remaining,
        endDate: v.ngay_ketthuc || null,
        banner: String(v.banner || ''),
        isSaved: Boolean(saved),
        isUsed: Boolean(saved && saved.isUsed)
      };
    });

    return res.json({ success: true, data: { items } });
  } catch (err) {
    console.error('voucherApi.listAvailable error:', err);
    return res.status(500).json({ success: false, message: 'Không thể tải voucher' });
  }
};

module.exports.saveVoucher = async (req, res) => {
  try {
    const code = normalizeCode(req.body && req.body.code ? req.body.code : req.query && req.query.code ? req.query.code : '');
    if (!code) return res.status(400).json({ success: false, message: 'Vui long nhap ma voucher' });

    const voucher = await Coupon.findOne({ code, daxoa: { $ne: true } }).select('_id').lean();
    if (!voucher) return res.status(404).json({ success: false, message: 'Voucher không tồn tại' });

    await UserVoucher.findOneAndUpdate(
      { nguoidung_id: req.user._id, voucher_id: voucher._id },
      { $setOnInsert: { isUsed: false, savedAt: new Date() } },
      { upsert: true, new: true }
    );

    return res.json({ success: true, message: 'Da luu voucher' });
  } catch (err) {
    console.error('voucherApi.saveVoucher error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lưu voucher' });
  }
};

module.exports.applyVoucher = async (req, res) => {
  try {
    const subtotal = Number(req.body && req.body.subtotal ? req.body.subtotal : 0);
    const code = normalizeCode(req.body && req.body.code ? req.body.code : '');
    const shippingRegion = normalizeShippingRegion(req.body && req.body.shippingRegion ? req.body.shippingRegion : '');
    const shippingFee = calcShippingFee(subtotal, shippingRegion);

    if (!code) {
      return res.json({ success: true, data: { discount: 0, shippingFee, total: Math.max(0, subtotal + shippingFee) } });
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
      data: {
        discount,
        shippingFee,
        total,
        voucher: {
          id: String(validation.voucher._id),
          code: String(validation.voucher.code || ''),
          type: String(validation.voucher.loai || ''),
          value: Number(validation.voucher.giatri || 0)
        }
      }
    });
  } catch (err) {
    console.error('voucherApi.applyVoucher error:', err);
    return res.status(500).json({ success: false, message: 'Không thể áp dụng voucher' });
  }
};


