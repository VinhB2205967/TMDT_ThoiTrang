const crypto = require('crypto');
const qs = require('qs');

const VNPAY_MACDINH = {
  tmnCode: '',
  hashSecret: '',
  url: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
};

function layGiaTriMoiTruong(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function laUrlCongKhai(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return false;
  return !/(localhost|127\.0\.0\.1)/i.test(u);
}

function dinhDangNgayVnpay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function sapXepThamSo(obj) {
  const sorted = {};
  const str = [];
  let key;

  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }

  str.sort();

  for (key = 0; key < str.length; key += 1) {
    sorted[str[key]] = encodeURIComponent(String(obj[str[key]])).replace(/%20/g, '+');
  }

  return sorted;
}

function taoChuoiQuery(obj) {
  return qs.stringify(obj, { encode: false });
}

function taoThanhToanVnpay({ orderId, amount, orderInfo, returnUrl, ipnUrl, ipAddr, locale = 'vn', orderType = 'other', bankCode = '' }) {
  const vnp_TmnCode = layGiaTriMoiTruong('VNPAY_TMN_CODE', VNPAY_MACDINH.tmnCode);
  const vnp_HashSecret = layGiaTriMoiTruong('VNPAY_HASH_SECRET', VNPAY_MACDINH.hashSecret);
  const vnp_Url = layGiaTriMoiTruong('VNPAY_URL', VNPAY_MACDINH.url);

  let ip = String(ipAddr || '').trim();
  if (!ip || ip === '::1') ip = '127.0.0.1';
  if (ip.includes('::ffff:')) ip = ip.replace('::ffff:', '');

  const vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode,
    vnp_Locale: locale,
    vnp_CurrCode: 'VND',
    vnp_TxnRef: String(orderId).slice(0, 20),
    vnp_OrderInfo: String(orderInfo || '').slice(0, 255),
    vnp_OrderType: orderType,
    vnp_Amount: Math.max(0, Math.round(Number(amount || 0) * 100)),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ip,
    vnp_CreateDate: dinhDangNgayVnpay(new Date())
  };

  if (ipnUrl && laUrlCongKhai(ipnUrl)) vnp_Params.vnp_IpnUrl = ipnUrl;
  if (bankCode) vnp_Params.vnp_BankCode = bankCode;

  const params = sapXepThamSo(vnp_Params);
  const signData = taoChuoiQuery(params);
  const secureHash = crypto.createHmac('sha512', vnp_HashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  params.vnp_SecureHash = secureHash;
  params.vnp_SecureHashType = 'SHA512';
  const paymentUrl = `${vnp_Url}?${taoChuoiQuery(params)}`;

//   if (String(process.env.VNPAY_DEBUG || '') === '1') {
//     // eslint-disable-next-line no-console
//     console.log('[VNPAY] tmnCode:', vnp_TmnCode);
//     // eslint-disable-next-line no-console
//     console.log('[VNPAY] txnRef:', vnp_Params.vnp_TxnRef);
//     // eslint-disable-next-line no-console
//     console.log('[VNPAY] amount:', vnp_Params.vnp_Amount);
//     // eslint-disable-next-line no-console
//     console.log('[VNPAY] signData:', signData);
//     // eslint-disable-next-line no-console
//     console.log('[VNPAY] secureHash:', secureHash);
//     // eslint-disable-next-line no-console
//     console.log('[VNPAY] paymentUrl:', paymentUrl);
//     if (!laUrlCongKhai(returnUrl)) {
//       // eslint-disable-next-line no-console
//       console.log('[VNPAY] warning: returnUrl is not public:', returnUrl);
//     }
//     if (ipnUrl && !laUrlCongKhai(ipnUrl)) {
//       // eslint-disable-next-line no-console
//       console.log('[VNPAY] warning: ipnUrl is not public:', ipnUrl);
//     }
//   }

  return paymentUrl;
}

function kiemTraChuKyVnpay(query) {
  const vnp_HashSecret = layGiaTriMoiTruong('VNPAY_HASH_SECRET', VNPAY_MACDINH.hashSecret);
  const params = { ...query };
  const secureHash = String(params.vnp_SecureHash || '');
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const sorted = sapXepThamSo(params);
  const signData = taoChuoiQuery(sorted);
  const checkHash = crypto.createHmac('sha512', vnp_HashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  return secureHash && checkHash === secureHash;
}

module.exports = {
  taoThanhToanVnpay,
  kiemTraChuKyVnpay
};
