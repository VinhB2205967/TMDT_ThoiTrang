const Coupon = require('../../models/coupon_model');
const UserVoucher = require('../../models/user_voucher_model');

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function isDateInRange(now, start, end) {
  const nowDate = new Date(now);
  const nowTime = nowDate.getTime();

  if (start) {
    const startDate = new Date(start);
    if (!Number.isNaN(startDate.getTime())) {
      startDate.setHours(0, 0, 0, 0);
      if (nowTime < startDate.getTime()) return false;
    }
  }

  if (end) {
    const endDate = new Date(end);
    if (!Number.isNaN(endDate.getTime())) {
      endDate.setHours(23, 59, 59, 999);
      if (nowTime > endDate.getTime()) return false;
    }
  }

  return true;
}

function calcDiscount({ type, value, maxDiscount, orderTotal }) {
  if (type === 'phantram') {
    let discount = orderTotal * (Number(value || 0) / 100);
    if (Number.isFinite(maxDiscount) && maxDiscount > 0) {
      discount = Math.min(discount, maxDiscount);
    }
    return Math.max(0, Math.round(discount));
  }

  if (type === 'tientruc_tiep') {
    return Math.max(0, Math.round(Number(value || 0)));
  }

  return 0;
}

async function validateVoucherForOrder({ code, userId, orderTotal }) {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, message: 'Vui lÃ²ng nháº­p mÃ£ voucher' };

  const voucher = await Coupon.findOne({ code: normalized, daxoa: { $ne: true } }).lean();
  if (!voucher) return { ok: false, message: 'Voucher khÃ´ng tá»“n táº¡i' };

  if (String(voucher.trangthai) !== 'active') {
    return { ok: false, message: 'Voucher Ä‘ang táº¡m khÃ³a' };
  }

  const now = new Date();
  if (!isDateInRange(now, voucher.ngay_batdau, voucher.ngay_ketthuc)) {
    return { ok: false, message: 'Voucher Ä‘Ã£ háº¿t háº¡n' };
  }

  if (voucher.soluong_toida != null && voucher.soluong_dasudung >= voucher.soluong_toida) {
    return { ok: false, message: 'Voucher Ä‘Ã£ háº¿t lÆ°á»£t sá»­ dá»¥ng' };
  }

  if (Number(orderTotal || 0) < Number(voucher.don_toithieu || 0)) {
    return { ok: false, message: 'ÄÆ¡n hÃ ng chÆ°a Ä‘á»§ Ä‘iá»u kiá»‡n Ã¡p dá»¥ng voucher' };
  }

  if (userId) {
    const userVoucher = await UserVoucher.findOne({
      nguoidung_id: userId,
      voucher_id: voucher._id,
      isUsed: true
    }).lean();
    if (userVoucher) {
      return { ok: false, message: 'Báº¡n Ä‘Ã£ sá»­ dá»¥ng voucher nÃ y' };
    }
  }

  const discount = calcDiscount({
    type: voucher.loai,
    value: voucher.giatri,
    maxDiscount: voucher.giam_toida,
    orderTotal
  });

  return { ok: true, voucher, discount };
}

async function reserveVoucherUsage(voucherId) {
  const result = await Coupon.updateOne(
    {
      _id: voucherId,
      $or: [
        { soluong_toida: { $exists: false } },
        { soluong_toida: null },
        { $expr: { $lt: ['$soluong_dasudung', '$soluong_toida'] } }
      ]
    },
    { $inc: { soluong_dasudung: 1 }, $set: { ngaycapnhat: new Date() } }
  );

  const modified = Number(result?.modifiedCount || result?.nModified || 0);
  return modified > 0;
}

async function releaseVoucherUsage(voucherId) {
  await Coupon.updateOne(
    { _id: voucherId, soluong_dasudung: { $gt: 0 } },
    { $inc: { soluong_dasudung: -1 }, $set: { ngaycapnhat: new Date() } }
  );
}

async function markVoucherUsed({ voucherId, userId }) {
  if (!voucherId || !userId) return;
  await UserVoucher.findOneAndUpdate(
    { nguoidung_id: userId, voucher_id: voucherId },
    { $set: { isUsed: true, usedAt: new Date(), savedAt: new Date() } },
    { upsert: true, new: true }
  );
}

async function unmarkVoucherUsed({ voucherId, userId }) {
  if (!voucherId || !userId) return;
  await UserVoucher.updateOne(
    { nguoidung_id: userId, voucher_id: voucherId },
    { $set: { isUsed: false, usedAt: null, savedAt: new Date() } }
  );
}

async function saveVoucher({ voucherId, userId }) {
  if (!voucherId || !userId) return;
  await UserVoucher.findOneAndUpdate(
    { nguoidung_id: userId, voucher_id: voucherId },
    { $setOnInsert: { isUsed: false, savedAt: new Date() } },
    { upsert: true, new: true }
  );
}

module.exports = {
  normalizeCode,
  validateVoucherForOrder,
  reserveVoucherUsage,
  releaseVoucherUsage,
  markVoucherUsed,
  unmarkVoucherUsed,
  saveVoucher
};

