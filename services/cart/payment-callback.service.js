const donhang = require('../../models/order_model');
const { kiemTraChuKyVnpay } = require('../payment/vnpay.service.js');
const {
  capNhatGiaoDichThanhToan,
  danhDauThanhCongTheoDonHang
} = require('../payment/payment.service.js');

function parseOrderIdFromMoMo({ orderId, extraData }) {
  let idDon = '';
  if (extraData) {
    try {
      const json = JSON.parse(Buffer.from(extraData, 'base64').toString('utf8'));
      idDon = json?.orderId ? String(json.orderId) : '';
    } catch {
      idDon = '';
    }
  }

  if (!idDon && orderId) idDon = String(orderId).split('-')[0];
  return idDon;
}

async function handleMoMoReturn({ query }) {
  const orderId = String(query.orderId || '').trim();
  const extraData = String(query.extraData || '').trim();
  const idDon = parseOrderIdFromMoMo({ orderId, extraData });
  const resultCode = Number(query.resultCode || -1);

  if (!idDon) return { redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };

  const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();
  const transId = query.transId ? String(query.transId) : '';

  if (resultCode === 0) {
    await donhang.updateOne(
      { _id: idDon },
      { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), momoTransId: transId || undefined, momoOrderId: orderId || undefined, momoRequestId: (query.requestId ? String(query.requestId) : orderId) || undefined, ngaycapnhat: new Date() } }
    );

    if (orderDoc) {
      try {
        await danhDauThanhCongTheoDonHang({
          donhangId: orderDoc._id,
          nguoidungId: orderDoc.nguoidung_id,
          phuongthuc: 'momo',
          sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
          magiaodich: orderId || undefined,
          successResponse: query,
          ghichu: 'MoMo return: success'
        });
      } catch {
        // best-effort
      }
    }

    return { redirect: `/orders/${idDon}`, flash: { type: 'success', message: 'Thanh toán MoMo thành công!' } };
  }

  await donhang.updateOne(
    { _id: idDon },
    { $set: { momoOrderId: orderId || undefined, momoRequestId: (query.requestId ? String(query.requestId) : orderId) || undefined, ngaycapnhat: new Date() } }
  );

  if (orderDoc) {
    try {
      await capNhatGiaoDichThanhToan({
        donhangId: orderDoc._id,
        nguoidungId: orderDoc.nguoidung_id,
        phuongthuc: 'momo',
        sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
        magiaodich: orderId || undefined,
        trangthai: 'choduyet',
        response: query,
        ghichu: `MoMo return: resultCode=${resultCode}`
      });
    } catch {
      // best-effort
    }
  }

  return { redirect: `/orders/${idDon}`, flash: { type: 'info', message: 'Đang chờ xác nhận thanh toán MoMo...' } };
}

async function handleMoMoIpn({ body }) {
  const orderId = String(body?.orderId || '').trim();
  const extraData = String(body?.extraData || '').trim();
  const idDon = parseOrderIdFromMoMo({ orderId, extraData });
  const resultCode = Number(body?.resultCode || -1);
  const transId = body?.transId ? String(body.transId) : '';

  if (idDon) {
    if (resultCode === 0) {
      await donhang.updateOne(
        { _id: idDon },
        { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), momoTransId: transId || undefined, momoOrderId: orderId || undefined, momoRequestId: (body?.requestId ? String(body.requestId) : orderId) || undefined, ngaycapnhat: new Date() } }
      );
    }

    const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();
    if (orderDoc) {
      try {
        if (resultCode === 0) {
          await danhDauThanhCongTheoDonHang({
            donhangId: orderDoc._id,
            nguoidungId: orderDoc.nguoidung_id,
            phuongthuc: 'momo',
            sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
            magiaodich: orderId || undefined,
            successResponse: body,
            ghichu: 'MoMo IPN: success'
          });
        } else {
          await capNhatGiaoDichThanhToan({
            donhangId: orderDoc._id,
            nguoidungId: orderDoc.nguoidung_id,
            phuongthuc: 'momo',
            sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
            magiaodich: orderId || undefined,
            trangthai: 'thatbai',
            response: body,
            ghichu: `MoMo IPN: resultCode=${resultCode}`
          });
        }
      } catch {
        // best-effort
      }
    }
  }

  return { status: 200, json: { success: true } };
}

async function handleVnpayReturn({ query }) {
  if (!kiemTraChuKyVnpay(query || {})) {
    return { redirect: '/orders', flash: { type: 'error', message: 'Chữ ký VNPAY không hợp lệ.' } };
  }

  const txnRef = String(query.vnp_TxnRef || '').trim();
  const responseCode = String(query.vnp_ResponseCode || '').trim();
  const transNo = String(query.vnp_TransactionNo || '').trim();
  const bankCode = String(query.vnp_BankCode || '').trim();

  let idDon = '';
  if (txnRef) {
    const found = await donhang.findOne({ vnpayTxnRef: txnRef }).select('_id').lean();
    idDon = found ? String(found._id) : '';
  }
  if (!idDon && txnRef) idDon = txnRef.split('-')[0];

  if (!idDon) return { redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };

  const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();

  if (responseCode === '00') {
    await donhang.updateOne(
      { _id: idDon },
      { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), vnpayTransId: transNo || undefined, vnpayBankCode: bankCode || undefined } }
    );

    if (orderDoc) {
      try {
        await danhDauThanhCongTheoDonHang({
          donhangId: orderDoc._id,
          nguoidungId: orderDoc.nguoidung_id,
          phuongthuc: 'vnpay',
          sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
          magiaodich: txnRef || undefined,
          chitiet: { nganhang: bankCode || undefined },
          successResponse: query,
          ghichu: 'VNPAY return: success'
        });
      } catch {
        // best-effort
      }
    }

    return { redirect: `/orders/${idDon}`, flash: { type: 'success', message: 'Thanh toán VNPAY thành công!' } };
  }

  if (orderDoc) {
    try {
      await capNhatGiaoDichThanhToan({
        donhangId: orderDoc._id,
        nguoidungId: orderDoc.nguoidung_id,
        phuongthuc: 'vnpay',
        sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
        magiaodich: txnRef || undefined,
        trangthai: 'thatbai',
        chitiet: { nganhang: bankCode || undefined },
        response: query,
        ghichu: `VNPAY return: responseCode=${responseCode}`
      });
    } catch {
      // best-effort
    }
  }

  return { redirect: `/orders/${idDon}`, flash: { type: 'error', message: 'Thanh toán VNPAY thất bại hoặc bị hủy.' } };
}

async function handleVnpayIpn({ query, body }) {
  const payload = Object.keys(query || {}).length ? query : body || {};
  if (!kiemTraChuKyVnpay(payload)) {
    return { status: 200, json: { RspCode: '97', Message: 'Invalid signature' } };
  }

  const txnRef = String(payload.vnp_TxnRef || '').trim();
  const responseCode = String(payload.vnp_ResponseCode || '').trim();
  const transNo = String(payload.vnp_TransactionNo || '').trim();
  const bankCode = String(payload.vnp_BankCode || '').trim();

  let idDon = '';
  if (txnRef) {
    const found = await donhang.findOne({ vnpayTxnRef: txnRef }).select('_id').lean();
    idDon = found ? String(found._id) : '';
  }
  if (!idDon && txnRef) idDon = txnRef.split('-')[0];

  if (idDon) {
    if (responseCode === '00') {
      await donhang.updateOne(
        { _id: idDon },
        { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), vnpayTransId: transNo || undefined, vnpayBankCode: bankCode || undefined } }
      );
    }

    const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();
    if (orderDoc) {
      try {
        if (responseCode === '00') {
          await danhDauThanhCongTheoDonHang({
            donhangId: orderDoc._id,
            nguoidungId: orderDoc.nguoidung_id,
            phuongthuc: 'vnpay',
            sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
            magiaodich: txnRef || undefined,
            successResponse: payload,
            ghichu: 'VNPAY IPN: success'
          });
        } else {
          await capNhatGiaoDichThanhToan({
            donhangId: orderDoc._id,
            nguoidungId: orderDoc.nguoidung_id,
            phuongthuc: 'vnpay',
            sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
            magiaodich: txnRef || undefined,
            trangthai: 'thatbai',
            chitiet: { nganhang: bankCode || undefined },
            response: payload,
            ghichu: `VNPAY IPN: responseCode=${responseCode}`
          });
        }
      } catch {
        // best-effort
      }
    }
  }

  return { status: 200, json: { RspCode: '00', Message: 'Success' } };
}

module.exports = {
  handleMoMoReturn,
  handleMoMoIpn,
  handleVnpayReturn,
  handleVnpayIpn
};
