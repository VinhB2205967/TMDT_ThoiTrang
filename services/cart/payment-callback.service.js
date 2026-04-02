const donhang = require('../../models/order_model');
const {
  kiemTraChuKyKetQuaMoMo,
  layThongTinXacThucMoMo
} = require('../payment/momo.service.js');
const { kiemTraChuKyVnpay } = require('../payment/vnpay.service.js');
const {
  capNhatGiaoDichThanhToan,
  danhDauThanhCongTheoDonHang
} = require('../payment/payment.service.js');
const { taoPhieuXuatTuDonHang } = require('../inventory/exportReceipt.service.js');
const { sendOrderConfirmedEmail } = require('../communication/orderEmail.service.js');
const { ghiNhanLichSuTrangThaiDonHang } = require('../order/order-sidecar.service.js');

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

function tinhSoTienDonHang(orderDoc) {
  return Math.max(0, Math.round(orderDoc?.tongtien || orderDoc?.tamtinh || 0));
}

async function timDonTheoCallbackMoMo({ gatewayOrderId, internalOrderId }) {
  if (gatewayOrderId) {
    const byGatewayOrder = await donhang.findOne({ momoOrderId: gatewayOrderId })
      .select('_id nguoidung_id tongtien tamtinh dathanhtoan momoOrderId momoRequestId momoTransId trangthai madonhang')
      .lean();
    if (byGatewayOrder) return byGatewayOrder;
  }

  if (internalOrderId) {
    return donhang.findById(internalOrderId)
      .select('_id nguoidung_id tongtien tamtinh dathanhtoan momoOrderId momoRequestId momoTransId trangthai madonhang')
      .lean();
  }

  return null;
}

function xacThucDuLieuDonMoMo({ payload, orderDoc }) {
  if (!orderDoc?._id) {
    return { ok: false, code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng.' };
  }

  const expectedAmount = tinhSoTienDonHang(orderDoc);
  const payloadAmount = Math.max(0, Math.round(Number(payload?.amount || 0)));
  const gatewayOrderId = String(payload?.orderId || '').trim();
  const gatewayRequestId = String(payload?.requestId || '').trim();
  const { partnerCode } = layThongTinXacThucMoMo();

  if (partnerCode && String(payload?.partnerCode || '').trim() !== partnerCode) {
    return { ok: false, code: 'PARTNER_CODE_MISMATCH', message: 'PartnerCode không hợp lệ.' };
  }

  if (gatewayOrderId && String(orderDoc.momoOrderId || '').trim() && gatewayOrderId !== String(orderDoc.momoOrderId || '').trim()) {
    return { ok: false, code: 'ORDER_ID_MISMATCH', message: 'orderId MoMo không khớp với đơn hàng.' };
  }

  if (gatewayRequestId && String(orderDoc.momoRequestId || '').trim() && gatewayRequestId !== String(orderDoc.momoRequestId || '').trim()) {
    return { ok: false, code: 'REQUEST_ID_MISMATCH', message: 'requestId MoMo không khớp với đơn hàng.' };
  }

  if (payloadAmount !== expectedAmount) {
    return { ok: false, code: 'AMOUNT_MISMATCH', message: 'Số tiền callback không khớp với đơn hàng.' };
  }

  return { ok: true, amount: expectedAmount };
}

async function tuDongXacNhanDonThanhToanOnline({ orderId, actorName }) {
  const current = await donhang.findOne({ _id: orderId, daxoa: { $ne: true } })
    .select('_id nguoidung_id madonhang trangthai')
    .lean();
  if (!current || String(current.trangthai || '') !== 'choxacnhan') return;

  const updated = await donhang.updateOne(
    { _id: orderId, trangthai: 'choxacnhan', daxoa: { $ne: true } },
    { $set: { trangthai: 'daxacnhan', ngaycapnhat: new Date() } }
  );

  if (!updated || Number(updated.modifiedCount || 0) === 0) return;

  try {
    await taoPhieuXuatTuDonHang({
      orderId,
      adminUser: null,
      note: 'Tự động xác nhận đơn hàng đã thanh toán online',
      skipInventoryAdjustments: true
    });
  } catch (error) {
    console.error('auto confirm export receipt error:', error);
  }

  try {
    await sendOrderConfirmedEmail({ orderId });
  } catch (error) {
    console.error('auto confirm email error:', error);
  }

  try {
    await ghiNhanLichSuTrangThaiDonHang({
      order: {
        _id: current._id,
        nguoidung_id: current.nguoidung_id,
        madonhang: current.madonhang
      },
      previousStatus: 'choxacnhan',
      nextStatus: 'daxacnhan',
      action: 'system_auto_confirm_online_paid_order',
      actor: { role: 'system', vaitro: 'system', name: actorName || 'payment-callback' },
      metadata: { autoConfirmedFromPayment: true }
    });
  } catch (error) {
    console.error('auto confirm order log error:', error);
  }
}

async function handleMoMoReturn({ query }) {
  const payload = query || {};
  const signatureCheck = kiemTraChuKyKetQuaMoMo(payload);
  if (!signatureCheck.valid) {
    return { redirect: '/orders', flash: { type: 'error', message: 'Chữ ký MoMo không hợp lệ.' } };
  }

  const gatewayOrderId = String(payload.orderId || '').trim();
  const extraData = String(payload.extraData || '').trim();
  const internalOrderId = parseOrderIdFromMoMo({ orderId: gatewayOrderId, extraData });
  const orderDoc = await timDonTheoCallbackMoMo({ gatewayOrderId, internalOrderId });
  const idDon = orderDoc ? String(orderDoc._id) : '';
  const resultCode = Number(payload.resultCode || -1);
  const transId = payload.transId ? String(payload.transId) : '';

  const orderCheck = xacThucDuLieuDonMoMo({ payload, orderDoc });
  if (!orderCheck.ok) {
    return { redirect: '/orders', flash: { type: 'error', message: orderCheck.message } };
  }

  if (resultCode === 0) {
    if (!orderDoc.dathanhtoan) {
      await donhang.updateOne(
        { _id: idDon, dathanhtoan: { $ne: true } },
        {
          $set: {
            dathanhtoan: true,
            ngaythanhtoan: new Date(),
            momoTransId: transId || undefined,
            momoOrderId: gatewayOrderId || undefined,
            momoRequestId: (payload.requestId ? String(payload.requestId) : gatewayOrderId) || undefined,
            ngaycapnhat: new Date()
          }
        }
      );

      try {
        await danhDauThanhCongTheoDonHang({
          donhangId: orderDoc._id,
          nguoidungId: orderDoc.nguoidung_id,
          phuongthuc: 'momo',
          sotien: orderCheck.amount,
          magiaodich: gatewayOrderId || undefined,
          successResponse: { ...payload, signatureVerified: true },
          ghichu: 'MoMo return: success'
        });
      } catch {
        // best-effort
      }
    }

    await tuDongXacNhanDonThanhToanOnline({
      orderId: idDon,
      actorName: 'momo-return'
    });

    return { redirect: `/orders/${idDon}`, flash: { type: 'success', message: 'Thanh toan MoMo thanh cong!' } };
  }

  await donhang.updateOne(
    { _id: idDon },
    {
      $set: {
        momoOrderId: gatewayOrderId || undefined,
        momoRequestId: (payload.requestId ? String(payload.requestId) : gatewayOrderId) || undefined,
        ngaycapnhat: new Date()
      }
    }
  );

  if (!orderDoc.dathanhtoan) {
    try {
      await capNhatGiaoDichThanhToan({
        donhangId: orderDoc._id,
        nguoidungId: orderDoc.nguoidung_id,
        phuongthuc: 'momo',
        sotien: orderCheck.amount,
        magiaodich: gatewayOrderId || undefined,
        trangthai: 'choduyet',
        response: { ...payload, signatureVerified: true },
        ghichu: `MoMo return: resultCode=${resultCode}`
      });
    } catch {
      // best-effort
    }
  }

  return { redirect: `/orders/${idDon}`, flash: { type: 'info', message: 'Đang chờ xác nhận thanh toán MoMo...' } };
}

async function handleMoMoIpn({ body }) {
  const payload = body || {};
  const signatureCheck = kiemTraChuKyKetQuaMoMo(payload);
  if (!signatureCheck.valid) {
    return { status: 200, json: { success: false, message: 'Invalid signature' } };
  }

  const gatewayOrderId = String(payload.orderId || '').trim();
  const extraData = String(payload.extraData || '').trim();
  const internalOrderId = parseOrderIdFromMoMo({ orderId: gatewayOrderId, extraData });
  const orderDoc = await timDonTheoCallbackMoMo({ gatewayOrderId, internalOrderId });
  const idDon = orderDoc ? String(orderDoc._id) : '';
  const resultCode = Number(payload.resultCode || -1);
  const transId = payload.transId ? String(payload.transId) : '';

  const orderCheck = xacThucDuLieuDonMoMo({ payload, orderDoc });
  if (!orderCheck.ok) {
    return { status: 200, json: { success: false, message: orderCheck.message } };
  }

  if (resultCode === 0 && !orderDoc.dathanhtoan) {
    await donhang.updateOne(
      { _id: idDon, dathanhtoan: { $ne: true } },
      {
        $set: {
          dathanhtoan: true,
          ngaythanhtoan: new Date(),
          momoTransId: transId || undefined,
          momoOrderId: gatewayOrderId || undefined,
          momoRequestId: (payload.requestId ? String(payload.requestId) : gatewayOrderId) || undefined,
          ngaycapnhat: new Date()
        }
      }
    );
  }

  try {
    if (resultCode === 0) {
      if (!orderDoc.dathanhtoan) {
        await danhDauThanhCongTheoDonHang({
          donhangId: orderDoc._id,
          nguoidungId: orderDoc.nguoidung_id,
          phuongthuc: 'momo',
          sotien: orderCheck.amount,
          magiaodich: gatewayOrderId || undefined,
          successResponse: { ...payload, signatureVerified: true },
          ghichu: 'MoMo IPN: success'
        });
      }

      await tuDongXacNhanDonThanhToanOnline({
        orderId: idDon,
        actorName: 'momo-ipn'
      });
    } else if (!orderDoc.dathanhtoan) {
      await capNhatGiaoDichThanhToan({
        donhangId: orderDoc._id,
        nguoidungId: orderDoc.nguoidung_id,
        phuongthuc: 'momo',
        sotien: orderCheck.amount,
        magiaodich: gatewayOrderId || undefined,
        trangthai: 'thatbai',
        response: { ...payload, signatureVerified: true },
        ghichu: `MoMo IPN: resultCode=${resultCode}`
      });
    }
  } catch {
    // best-effort
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

    await tuDongXacNhanDonThanhToanOnline({
      orderId: idDon,
      actorName: 'vnpay-return'
    });

    return { redirect: `/orders/${idDon}`, flash: { type: 'success', message: 'Thanh toan VNPAY thanh cong!' } };
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

          await tuDongXacNhanDonThanhToanOnline({
            orderId: idDon,
            actorName: 'vnpay-ipn'
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
