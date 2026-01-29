const Thanhtoan = require('../models/pay_model');

const PAY_STATUS = {
  pending: 'choduyet',
  success: 'thanhcong',
  failed: 'thatbai',
  refunded: 'hoantien'
};

const PENDING_VALUES = ['pending', PAY_STATUS.pending];

function normalizePayStatus(value) {
  const s = String(value || '').trim();
  if (!s) return PAY_STATUS.pending;
  if (s === 'pending') return PAY_STATUS.pending;
  if (s === 'success') return PAY_STATUS.success;
  if (s === 'failed') return PAY_STATUS.failed;
  if (s === 'refunded') return PAY_STATUS.refunded;
  // Already Vietnamese token (or unknown custom)
  return s;
}

async function danhDauGiaoDichPendingCu({ donhangId, phuongthuc, ghichu }) {
  try {
    await Thanhtoan.updateMany(
      { donhang_id: donhangId, phuongthuc: phuongthuc, trangthai: { $in: PENDING_VALUES } },
      { $set: { trangthai: PAY_STATUS.failed, ghichu: ghichu || 'Tạo giao dịch mới', ngaycapnhat: new Date() } }
    );
  } catch {
    // best-effort
  }
}

async function taoGiaoDichThanhToan({
  donhangId,
  nguoidungId,
  phuongthuc,
  sotien,
  magiaodich,
  trangthai = PAY_STATUS.pending,
  chitiet,
  response,
  ghichu
}) {
  if (!donhangId) throw new Error('Thiếu donhangId');
  if (!nguoidungId) throw new Error('Thiếu nguoidungId');
  if (!phuongthuc) throw new Error('Thiếu phuongthuc');

  const amount = Number(sotien || 0);

  await danhDauGiaoDichPendingCu({
    donhangId,
    phuongthuc,
    ghichu: 'Đóng giao dịch pending cũ (tạo mới)'
  });

  return Thanhtoan.create({
    donhang_id: donhangId,
    nguoidung_id: nguoidungId,
    magiaodich: magiaodich || undefined,
    phuongthuc,
    sotien: amount,
    trangthai: normalizePayStatus(trangthai),
    chitiet: chitiet || undefined,
    response: response,
    ghichu: ghichu || undefined,
    ngaycapnhat: new Date()
  });
}

async function capNhatGiaoDichThanhToan({
  donhangId,
  nguoidungId,
  phuongthuc,
  sotien,
  magiaodich,
  trangthai,
  chitiet,
  response,
  ghichu
}) {
  if (!donhangId) throw new Error('Thiếu donhangId');
  if (!phuongthuc) throw new Error('Thiếu phuongthuc');

  const amount = Number(sotien || 0);

  const query = {
    donhang_id: donhangId,
    phuongthuc: phuongthuc
  };

  if (magiaodich) {
    query.magiaodich = magiaodich;
  }

  const $set = {
    ngaycapnhat: new Date()
  };

  if (trangthai) $set.trangthai = normalizePayStatus(trangthai);
  if (magiaodich) $set.magiaodich = magiaodich;
  if (typeof chitiet !== 'undefined') $set.chitiet = chitiet;
  if (typeof response !== 'undefined') $set.response = response;
  if (typeof ghichu !== 'undefined') $set.ghichu = ghichu;

  const $setOnInsert = {
    donhang_id: donhangId,
    nguoidung_id: nguoidungId,
    phuongthuc: phuongthuc,
    sotien: amount,
    trangthai: normalizePayStatus(trangthai || PAY_STATUS.pending),
    ngaytao: new Date()
  };

  if (magiaodich) $setOnInsert.magiaodich = magiaodich;
  if (typeof chitiet !== 'undefined') $setOnInsert.chitiet = chitiet;
  if (typeof response !== 'undefined') $setOnInsert.response = response;
  if (typeof ghichu !== 'undefined') $setOnInsert.ghichu = ghichu;

  return Thanhtoan.findOneAndUpdate(
    query,
    { $set, $setOnInsert },
    { upsert: true, new: true }
  );
}

async function danhDauThatBaiTheoDonHang({
  donhangId,
  nguoidungId,
  phuongthuc,
  sotien,
  response,
  ghichu
}) {
  if (!donhangId) throw new Error('Thiếu donhangId');
  if (!phuongthuc) throw new Error('Thiếu phuongthuc');

  const amount = Number(sotien || 0);

  const result = await Thanhtoan.updateMany(
    { donhang_id: donhangId, phuongthuc: phuongthuc, trangthai: { $in: PENDING_VALUES } },
    { $set: { trangthai: PAY_STATUS.failed, response: response, ghichu: ghichu || 'Hủy đơn', ngaycapnhat: new Date() } }
  );

  const modified = Number(result?.modifiedCount || result?.nModified || 0);
  if (modified > 0) return { modifiedCount: modified };

  
  return capNhatGiaoDichThanhToan({
    donhangId,
    nguoidungId,
    phuongthuc,
    sotien: amount,
    trangthai: PAY_STATUS.failed,
    response,
    ghichu: ghichu || 'Hủy đơn'
  });
}

async function danhDauThatBaiTatCaPendingTheoDonHang({
  donhangId,
  response,
  ghichu
}) {
  if (!donhangId) throw new Error('Thiếu donhangId');

  return Thanhtoan.updateMany(
    { donhang_id: donhangId, trangthai: { $in: PENDING_VALUES } },
    { $set: { trangthai: PAY_STATUS.failed, response: response, ghichu: ghichu || 'Hủy đơn', ngaycapnhat: new Date() } }
  );
}

async function danhDauHoanTienMoMoTheoDonHang({
  donhangId,
  nguoidungId,
  sotien,
  magiaodich,
  refundResponse,
  ghichu
}) {
  if (!donhangId) throw new Error('Thiếu donhangId');

  const result = await Thanhtoan.updateMany(
    { donhang_id: donhangId, phuongthuc: 'momo', trangthai: { $in: PENDING_VALUES } },
    {
      $set: {
        trangthai: PAY_STATUS.refunded,
        ghichu: ghichu || 'Hoàn tiền MoMo',
        ngaycapnhat: new Date(),
        ...(typeof magiaodich !== 'undefined' && magiaodich ? { magiaodich } : {}),
        ...(typeof refundResponse !== 'undefined' ? { 'response.refund': refundResponse } : {})
      }
    }
  );

  const modified = Number(result?.modifiedCount || result?.nModified || 0);
  if (modified > 0) return { modifiedCount: modified };

  // Không tìm thấy pending để cập nhật -> upsert bản ghi refunded để có dấu vết.
  return capNhatGiaoDichThanhToan({
    donhangId,
    nguoidungId,
    phuongthuc: 'momo',
    sotien: Number(sotien || 0),
    magiaodich: magiaodich || undefined,
    trangthai: PAY_STATUS.refunded,
    response: typeof refundResponse !== 'undefined' ? { refund: refundResponse } : undefined,
    ghichu: ghichu || 'Hoàn tiền MoMo'
  });
}

async function danhDauThanhCongTheoDonHang({
  donhangId,
  nguoidungId,
  phuongthuc,
  sotien,
  magiaodich,
  successResponse,
  ghichu
}) {
  if (!donhangId) throw new Error('Thiếu donhangId');
  if (!phuongthuc) throw new Error('Thiếu phuongthuc');

  const amount = Number(sotien || 0);

  const result = await Thanhtoan.updateMany(
    { donhang_id: donhangId, phuongthuc: phuongthuc, trangthai: { $in: PENDING_VALUES } },
    {
      $set: {
        trangthai: PAY_STATUS.success,
        ghichu: ghichu || 'Thanh toán thành công',
        ngaycapnhat: new Date(),
        ...(typeof magiaodich !== 'undefined' && magiaodich ? { magiaodich } : {}),
        ...(typeof successResponse !== 'undefined' ? { 'response.success': successResponse } : {})
      }
    }
  );

  const modified = Number(result?.modifiedCount || result?.nModified || 0);
  if (modified > 0) return { modifiedCount: modified };

  // Không có pending để update -> upsert 1 record thành công (để không bị kẹt trạng thái).
  return capNhatGiaoDichThanhToan({
    donhangId,
    nguoidungId,
    phuongthuc,
    sotien: amount,
    magiaodich: magiaodich || undefined,
    trangthai: PAY_STATUS.success,
    response: typeof successResponse !== 'undefined' ? { success: successResponse } : undefined,
    ghichu: ghichu || 'Thanh toán thành công'
  });
}

module.exports = {
  taoGiaoDichThanhToan,
  capNhatGiaoDichThanhToan,
  danhDauThatBaiTheoDonHang,
  danhDauThatBaiTatCaPendingTheoDonHang,
  danhDauHoanTienMoMoTheoDonHang,
  danhDauThanhCongTheoDonHang
};
