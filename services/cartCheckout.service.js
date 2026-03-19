const donhang = require('../models/order_model');
const chitietdonhang = require('../models/order_item_model');
const nguoidung = require('../models/user_model');
const SHIPPING_CONFIG = require('../config/shipping');
const { getOrCreateCart } = require('./cart.service');
const {
  dongBoGiaGioHang,
  normalizeShippingRegion,
  calcShippingFee
} = require('./cartPricing.service');
const { truTonTheoItem } = require('./cartInventory.service');
const {
  normalizeCode,
  validateVoucherForOrder,
  reserveVoucherUsage,
  releaseVoucherUsage,
  markVoucherUsed
} = require('./voucher.service');
const { taoThanhToanMoMo } = require('./momo.service');
const { taoThanhToanVnpay, kiemTraChuKyVnpay } = require('./vnpay.service');
const {
  taoGiaoDichThanhToan,
  capNhatGiaoDichThanhToan,
  danhDauThanhCongTheoDonHang
} = require('./payment.service');

const CP1252_UNICODE_TO_BYTE = new Map([
  [0x20AC, 0x80],
  [0x201A, 0x82],
  [0x0192, 0x83],
  [0x201E, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02C6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8A],
  [0x2039, 0x8B],
  [0x0152, 0x8C],
  [0x017D, 0x8E],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201C, 0x93],
  [0x201D, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02DC, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9A],
  [0x203A, 0x9B],
  [0x0153, 0x9C],
  [0x017E, 0x9E],
  [0x0178, 0x9F]
]);

function looksLikeMojibake(value) {
  return /(?:Ã.|Â.|Ä.|Æ.|á»|áº|â€|â€™|â€œ|â€\u009d|â€¦)/.test(String(value || ''));
}

function normalizeDisplayText(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (!text) return '';
  if (!looksLikeMojibake(text)) return text;

  const bytes = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code <= 0xFF) {
      bytes.push(code);
      continue;
    }

    const mapped = CP1252_UNICODE_TO_BYTE.get(code);
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }

    return text;
  }

  try {
    const repaired = Buffer.from(bytes).toString('utf8');
    if (!repaired || repaired.includes('\uFFFD')) return text;
    return repaired;
  } catch {
    return text;
  }
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function lineTotalFromItem(item) {
  if (Number.isFinite(Number(item?.thanhtien))) return Number(item.thanhtien);
  return (Number(item?.giagiam || item?.gia || 0) * Number(item?.soluong || 1));
}

function pickCheckoutItems(cartDoc, selectedIds) {
  const allItems = Array.isArray(cartDoc?.sanpham) ? cartDoc.sanpham : [];
  const normalizedIds = toStringArray(selectedIds);
  if (!normalizedIds.length) return allItems;

  const idSet = new Set(normalizedIds);
  return allItems.filter((item) => idSet.has(String(item._id)));
}

function buildCheckoutAddresses(accountDoc) {
  const profile = accountDoc || {};
  const fromList = Array.isArray(profile.diachiList) ? profile.diachiList : [];
  const output = [];

  if (profile.diachi) {
    output.push({
      _id: 'profile',
      label: 'Địa chỉ mặc định',
      tennguoinhan: normalizeDisplayText(profile.hoten || ''),
      sodienthoai: normalizeDisplayText(profile.sodienthoai || ''),
      diachi: normalizeDisplayText(profile.diachi || '')
    });
  }

  for (const addr of fromList) {
    output.push({
      _id: String(addr._id),
      label: normalizeDisplayText(addr.label || 'Địa chỉ'),
      tennguoinhan: normalizeDisplayText(addr.tennguoinhan || profile.hoten || ''),
      sodienthoai: normalizeDisplayText(addr.sodienthoai || profile.sodienthoai || ''),
      diachi: normalizeDisplayText(addr.diachi || '')
    });
  }

  return output;
}

function resolveShippingAddress({ accountDoc, body }) {
  const account = accountDoc || null;
  const payload = body || {};
  const addressId = String(payload.addressId || '');
  let tennguoinhan = '';
  let sodienthoai = '';
  let diachigiao = '';

  if (addressId && addressId !== 'new') {
    if (addressId === 'profile') {
      tennguoinhan = normalizeDisplayText(account?.hoten || '').trim();
      sodienthoai = normalizeDisplayText(account?.sodienthoai || '').trim();
      diachigiao = normalizeDisplayText(account?.diachi || '').trim();
    } else {
      const list = Array.isArray(account?.diachiList) ? account.diachiList : [];
      const found = list.find((addr) => String(addr?._id) === addressId);
      if (found) {
        tennguoinhan = normalizeDisplayText(found.tennguoinhan || account?.hoten || '').trim();
        sodienthoai = normalizeDisplayText(found.sodienthoai || account?.sodienthoai || '').trim();
        diachigiao = normalizeDisplayText(found.diachi || '').trim();
      }
    }
  }

  if (!tennguoinhan || !sodienthoai || !diachigiao) {
    tennguoinhan = normalizeDisplayText(payload.tennguoinhan || '').trim();
    sodienthoai = normalizeDisplayText(payload.sodienthoai || '').trim();
    diachigiao = normalizeDisplayText(payload.diachigiao || '').trim();
  }

  return {
    addressId,
    tennguoinhan,
    sodienthoai,
    diachigiao
  };
}

function extractMomoOrderId({ orderId, extraData }) {
  const rawOrderId = String(orderId || '').trim();
  const rawExtraData = String(extraData || '').trim();
  let idDon = '';

  if (rawExtraData) {
    try {
      const json = JSON.parse(Buffer.from(rawExtraData, 'base64').toString('utf8'));
      idDon = json?.orderId ? String(json.orderId) : '';
    } catch {
      idDon = '';
    }
  }

  if (!idDon && rawOrderId) {
    idDon = String(rawOrderId).split('-')[0];
  }

  return {
    idDon,
    orderId: rawOrderId
  };
}

async function createMomoCheckoutPayment({
  orderDoc,
  userId,
  tongtien,
  protocol,
  host
}) {
  const redirectUrl = String(process.env.MOMO_REDIRECT_URL || `${protocol}://${host}/cart/momo/return`);
  const ipnUrl = String(process.env.MOMO_IPN_URL || `${protocol}://${host}/cart/momo/ipn`);
  const orderInfo = `Thanh toán đơn hàng ${orderDoc.madonhang || String(orderDoc._id)}`;
  const maMoMo = `${orderDoc._id}-${Date.now()}`;
  const extraData = Buffer.from(JSON.stringify({ orderId: String(orderDoc._id) })).toString('base64');
  const soTienThanhToan = Math.max(0, Math.round(tongtien));

  const ketqua = await taoThanhToanMoMo({
    orderId: maMoMo,
    requestId: maMoMo,
    amount: String(soTienThanhToan),
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData
  });

  await donhang.updateOne(
    { _id: orderDoc._id },
    {
      $set: {
        momoOrderId: maMoMo,
        momoRequestId: maMoMo,
        momoPayUrl: ketqua?.payUrl || undefined,
        ngaycapnhat: new Date()
      }
    }
  );

  try {
    await taoGiaoDichThanhToan({
      donhangId: orderDoc._id,
      nguoidungId: userId,
      phuongthuc: 'momo',
      sotien: soTienThanhToan,
      magiaodich: maMoMo,
      trangthai: ketqua?.payUrl ? 'choduyet' : 'thatbai',
      response: ketqua,
      ghichu: ketqua?.payUrl ? 'Tạo thanh toán MoMo' : (ketqua?.message || 'Không thể tạo thanh toán MoMo')
    });
  } catch {
    // best-effort
  }

  return {
    payUrl: ketqua?.payUrl ? String(ketqua.payUrl) : '',
    message: ketqua?.message || ''
  };
}

async function createVnpayCheckoutPayment({
  orderDoc,
  userId,
  tongtien,
  protocol,
  host,
  forwardedFor,
  remoteAddress,
  requestIp
}) {
  const returnUrl = String(process.env.VNPAY_RETURN_URL || `${protocol}://${host}/cart/vnpay/return`);
  const ipnUrl = String(process.env.VNPAY_IPN_URL || `${protocol}://${host}/cart/vnpay/ipn`);
  const now = new Date();
  const txnRef = `${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
  const orderInfo = `Thanh toan cho ma GD:${txnRef}`;
  const ipAddr = String(forwardedFor || remoteAddress || requestIp || '127.0.0.1').split(',')[0].trim();

  await donhang.updateOne(
    { _id: orderDoc._id },
    { $set: { vnpayTxnRef: txnRef } }
  );

  const soTienThanhToan = Math.max(0, Math.round(tongtien));
  const payUrl = taoThanhToanVnpay({
    orderId: txnRef,
    amount: soTienThanhToan,
    orderInfo,
    returnUrl,
    ipnUrl,
    ipAddr,
    locale: 'vn',
    orderType: 'other'
  });

  try {
    await taoGiaoDichThanhToan({
      donhangId: orderDoc._id,
      nguoidungId: userId,
      phuongthuc: 'vnpay',
      sotien: soTienThanhToan,
      magiaodich: txnRef,
      trangthai: 'choduyet',
      response: { txnRef, payUrl },
      ghichu: 'Tạo thanh toán VNPAY'
    });
  } catch {
    // best-effort
  }

  return {
    payUrl: String(payUrl || '')
  };
}

async function getCheckoutPageData({ userId, itemIds }) {
  const giohang = await getOrCreateCart(userId);
  const daDongBoGia = await dongBoGiaGioHang(giohang);
  if (daDongBoGia) {
    await giohang.save();
  }

  const items = pickCheckoutItems(giohang, itemIds);
  const tamtinh = items.reduce((sum, item) => sum + lineTotalFromItem(item), 0);
  const selectedShippingRegion = SHIPPING_CONFIG.defaultRegion || 'noithanh';
  const shippingFee = calcShippingFee(tamtinh, selectedShippingRegion);
  const finalTotal = Math.max(0, tamtinh + shippingFee);

  const taikhoan = await nguoidung.findOne({ _id: userId, daxoa: { $ne: true } }).lean();

  return {
    cart: giohang,
    items,
    subtotal: tamtinh,
    shippingFee,
    finalTotal,
    shippingConfig: SHIPPING_CONFIG,
    selectedShippingRegion,
    selectedIds: items.map((item) => String(item._id)),
    userProfile: {
      hoten: normalizeDisplayText(taikhoan?.hoten || ''),
      sodienthoai: normalizeDisplayText(taikhoan?.sodienthoai || ''),
      email: normalizeDisplayText(taikhoan?.email || ''),
      diachi: normalizeDisplayText(taikhoan?.diachi || '')
    },
    addresses: buildCheckoutAddresses(taikhoan || null)
  };
}

async function orchestrateCheckout({
  userId,
  body,
  protocol,
  host,
  forwardedFor,
  remoteAddress,
  requestIp
}) {
  let voucherDoc = null;
  let reservedVoucher = false;
  let orderCreated = false;

  try {
    const giohang = await getOrCreateCart(userId);
    const daDongBoGia = await dongBoGiaGioHang(giohang);
    if (daDongBoGia) {
      await giohang.save();
    }

    if (!giohang.sanpham || giohang.sanpham.length === 0) {
      return { ok: false, redirectTo: '/cart' };
    }

    const items = pickCheckoutItems(giohang, body?.itemIds);
    if (!items.length) {
      return {
        ok: false,
        redirectTo: '/cart',
        flashType: 'error',
        message: 'Vui lòng chọn sản phẩm để thanh toán'
      };
    }

    const taikhoan = await nguoidung.findOne({ _id: userId, daxoa: { $ne: true } });
    const shippingAddress = resolveShippingAddress({ accountDoc: taikhoan, body });
    const tennguoinhan = shippingAddress.tennguoinhan;
    const sodienthoai = shippingAddress.sodienthoai;
    const diachigiao = shippingAddress.diachigiao;
    const iddiachi = shippingAddress.addressId;

    if (!tennguoinhan || !sodienthoai || !diachigiao) {
      return {
        ok: false,
        redirectTo: '/cart/checkout',
        flashType: 'error',
        message: 'Vui lòng nhập đầy đủ họ tên, số điện thoại, địa chỉ'
      };
    }

    const emaillienhe = String(body?.email || taikhoan?.email || '').trim();
    const ghichu = String(body?.ghichu || '').trim();
    const phuongthucthanhtoan = String(body?.phuongthucthanhtoan || 'cod');

    let shouldSaveProfile = false;
    if (taikhoan && !String(taikhoan.diachi || '').trim()) {
      taikhoan.diachi = diachigiao;
      if (!String(taikhoan.hoten || '').trim()) taikhoan.hoten = tennguoinhan;
      if (!String(taikhoan.sodienthoai || '').trim()) taikhoan.sodienthoai = sodienthoai;
      shouldSaveProfile = true;
    }

    if (String(body?.saveAddress || '') && taikhoan && (iddiachi === 'new' || !iddiachi)) {
      taikhoan.diachiList = taikhoan.diachiList || [];
      taikhoan.diachiList.push({
        label: normalizeDisplayText(body?.addressLabel || '').trim() || 'Địa chỉ',
        tennguoinhan,
        sodienthoai,
        diachi: diachigiao
      });
      shouldSaveProfile = true;
    }

    if (shouldSaveProfile) {
      await taikhoan.save();
    }

    const tamtinh = items.reduce((sum, item) => sum + lineTotalFromItem(item), 0);
    const shippingRegion = normalizeShippingRegion(body?.shippingRegion);
    const phivanchuyen = calcShippingFee(tamtinh, shippingRegion);

    let giamgia = 0;
    const voucherCode = normalizeCode(body?.voucherCode);
    if (voucherCode) {
      const validation = await validateVoucherForOrder({
        code: voucherCode,
        userId,
        orderTotal: tamtinh
      });

      if (!validation.ok) {
        return {
          ok: false,
          redirectTo: '/cart/checkout',
          flashType: 'error',
          message: normalizeDisplayText(validation.message || 'Voucher không hợp lệ')
        };
      }

      voucherDoc = validation.voucher;
      giamgia = Math.min(Number(validation.discount || 0), tamtinh);
      reservedVoucher = await reserveVoucherUsage(voucherDoc._id);

      if (!reservedVoucher) {
        return {
          ok: false,
          redirectTo: '/cart/checkout',
          flashType: 'error',
          message: 'Voucher đã hết lượt sử dụng'
        };
      }
    }

    const tongtien = Math.max(0, tamtinh - giamgia + phivanchuyen);

    let donhangdoc = null;
    try {
      donhangdoc = await donhang.create({
        nguoidung_id: userId,
        tennguoinhan,
        sodienthoai,
        email: emaillienhe,
        diachigiao,
        ghichu,
        phuongthucthanhtoan,
        phuongthucvanchuyen: shippingRegion,
        tamtinh,
        giamgia,
        phivanchuyen,
        tongtien,
        voucher_id: voucherDoc?._id || undefined,
        voucher_code: voucherDoc?.code || undefined,
        voucher_type: voucherDoc?.loai || undefined,
        voucher_value: voucherDoc?.giatri || undefined,
        voucher_discount: giamgia,
        trangthai: 'choxacnhan',
        ngaycapnhat: new Date()
      });
      orderCreated = true;
    } catch (error) {
      if (reservedVoucher && voucherDoc) {
        await releaseVoucherUsage(voucherDoc._id);
      }
      throw error;
    }

    if (voucherDoc) {
      await markVoucherUsed({ voucherId: voucherDoc._id, userId });
    }

    for (const item of items) {
      const inventoryResult = await truTonTheoItem(item);
      const fifoAllocations = Array.isArray(inventoryResult?.fifoAllocations)
        ? inventoryResult.fifoAllocations
          .map((a) => ({
            lotId: String(a?.lotId || ''),
            soLuong: Number(a?.soLuong || 0),
            giaNhap: Number(a?.giaNhap || 0),
            giaBanDeXuat: Number(a?.giaBanDeXuat || 0)
          }))
          .filter((a) => a.soLuong > 0)
        : [];
      const lineTotal = lineTotalFromItem(item);
      const qty = Number(item.soluong || 1) || 1;
      const unitPriceBeforeDiscount = Math.max(0, Math.round(Number(item.gia || 0)));
      const unitPriceAfterDiscountRaw = qty > 0 ? (lineTotal / qty) : Number(item.giagiam || item.gia || 0);
      const unitPriceAfterDiscount = Math.max(0, Math.round(unitPriceAfterDiscountRaw));

      await chitietdonhang.create({
        donhang_id: donhangdoc._id,
        sanpham_id: item.sanpham_id,
        bienthe_id: item.bienthe_id,
        tensanpham: item.tensanpham,
        hinhanh: item.hinhanh,
        mausac: item.mausac,
        kichco: item.kichco,
        giagoc: unitPriceBeforeDiscount,
        giaban: unitPriceAfterDiscount,
        soluong: item.soluong,
        thanhtien: lineTotal,
        fifoAllocations
      });
    }

    const selectedSet = new Set(items.map((item) => String(item._id)));
    giohang.sanpham = giohang.sanpham.filter((item) => !selectedSet.has(String(item._id)));
    await giohang.save();

    if (phuongthucthanhtoan === 'momo') {
      const momo = await createMomoCheckoutPayment({
        orderDoc: donhangdoc,
        userId,
        tongtien,
        protocol,
        host
      });

      if (momo.payUrl) {
        return { ok: true, redirectTo: momo.payUrl };
      }

      return {
        ok: true,
        redirectTo: `/orders/${donhangdoc._id}`,
        flashType: 'error',
        message: momo.message || 'Không thể tạo thanh toán MoMo'
      };
    }

    if (phuongthucthanhtoan === 'vnpay') {
      const vnpay = await createVnpayCheckoutPayment({
        orderDoc: donhangdoc,
        userId,
        tongtien,
        protocol,
        host,
        forwardedFor,
        remoteAddress,
        requestIp
      });

      return { ok: true, redirectTo: vnpay.payUrl };
    }

    if (phuongthucthanhtoan === 'cod') {
      return {
        ok: true,
        redirectTo: `/orders/${donhangdoc._id}`,
        flashType: 'success',
        message: 'Đặt hàng thành công!'
      };
    }

    return { ok: true, redirectTo: `/orders/${donhangdoc._id}` };
  } catch (error) {
    if (reservedVoucher && voucherDoc && !orderCreated) {
      try {
        await releaseVoucherUsage(voucherDoc._id);
      } catch {
        // ignore
      }
    }
    throw error;
  }
}

async function handleMomoReturn(query = {}) {
  const parsed = extractMomoOrderId({
    orderId: query.orderId,
    extraData: query.extraData
  });
  const idDon = parsed.idDon;
  const orderId = parsed.orderId;
  const resultCode = Number(query.resultCode || -1);
  const transId = query.transId ? String(query.transId) : '';

  if (!idDon) {
    return {
      redirectTo: '/orders',
      flashType: 'error',
      message: 'Không tìm thấy đơn hàng.'
    };
  }

  const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();

  if (resultCode === 0) {
    await donhang.updateOne(
      { _id: idDon },
      {
        $set: {
          dathanhtoan: true,
          ngaythanhtoan: new Date(),
          momoTransId: transId || undefined,
          momoOrderId: orderId || undefined,
          momoRequestId: (query.requestId ? String(query.requestId) : orderId) || undefined,
          ngaycapnhat: new Date()
        }
      }
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

    return {
      redirectTo: `/orders/${idDon}`,
      flashType: 'success',
      message: 'Thanh toán MoMo thành công!'
    };
  }

  await donhang.updateOne(
    { _id: idDon },
    {
      $set: {
        momoOrderId: orderId || undefined,
        momoRequestId: (query.requestId ? String(query.requestId) : orderId) || undefined,
        ngaycapnhat: new Date()
      }
    }
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

  return {
    redirectTo: `/orders/${idDon}`,
    flashType: 'info',
    message: 'Đang chờ xác nhận thanh toán MoMo...'
  };
}

async function handleMomoIpn(body = {}) {
  const parsed = extractMomoOrderId({
    orderId: body.orderId,
    extraData: body.extraData
  });
  const idDon = parsed.idDon;
  const orderId = parsed.orderId;
  const resultCode = Number(body.resultCode || -1);
  const transId = body.transId ? String(body.transId) : '';

  if (idDon) {
    if (resultCode === 0) {
      await donhang.updateOne(
        { _id: idDon },
        {
          $set: {
            dathanhtoan: true,
            ngaythanhtoan: new Date(),
            momoTransId: transId || undefined,
            momoOrderId: orderId || undefined,
            momoRequestId: (body.requestId ? String(body.requestId) : orderId) || undefined,
            ngaycapnhat: new Date()
          }
        }
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

  return { success: true };
}

async function handleVnpayReturn(query = {}) {
  if (!kiemTraChuKyVnpay(query || {})) {
    return {
      redirectTo: '/orders',
      flashType: 'error',
      message: 'Chữ ký VNPAY không hợp lệ.'
    };
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
  if (!idDon && txnRef) {
    idDon = txnRef.split('-')[0];
  }

  if (!idDon) {
    return {
      redirectTo: '/orders',
      flashType: 'error',
      message: 'Không tìm thấy đơn hàng.'
    };
  }

  const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();

  if (responseCode === '00') {
    await donhang.updateOne(
      { _id: idDon },
      {
        $set: {
          dathanhtoan: true,
          ngaythanhtoan: new Date(),
          vnpayTransId: transNo || undefined,
          vnpayBankCode: bankCode || undefined
        }
      }
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

    return {
      redirectTo: `/orders/${idDon}`,
      flashType: 'success',
      message: 'Thanh toán VNPAY thành công!'
    };
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

  return {
    redirectTo: `/orders/${idDon}`,
    flashType: 'error',
    message: 'Thanh toán VNPAY thất bại hoặc bị hủy.'
  };
}

async function handleVnpayIpn({ query = {}, body = {} } = {}) {
  const payload = Object.keys(query || {}).length ? (query || {}) : (body || {});

  if (!kiemTraChuKyVnpay(payload)) {
    return { RspCode: '97', Message: 'Invalid signature' };
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
  if (!idDon && txnRef) {
    idDon = txnRef.split('-')[0];
  }

  if (idDon) {
    if (responseCode === '00') {
      await donhang.updateOne(
        { _id: idDon },
        {
          $set: {
            dathanhtoan: true,
            ngaythanhtoan: new Date(),
            vnpayTransId: transNo || undefined,
            vnpayBankCode: bankCode || undefined
          }
        }
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

  return { RspCode: '00', Message: 'Success' };
}

module.exports = {
  getCheckoutPageData,
  orchestrateCheckout,
  handleMomoReturn,
  handleMomoIpn,
  handleVnpayReturn,
  handleVnpayIpn
};
