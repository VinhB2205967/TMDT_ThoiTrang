const https = require('https');
const crypto = require('crypto');

const MOMO_MACDINH = {
  partnerCode: '',
  accessKey: '',
  secretKey: ''
};
// Lấy giá trị môi trường với tên biến và giá trị mặc định nếu không tồn tại
function layGiaTriMoiTruong(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function layThongTinXacThucMoMo() {
  return {
    partnerCode: layGiaTriMoiTruong('MOMO_PARTNER_CODE', MOMO_MACDINH.partnerCode),
    accessKey: layGiaTriMoiTruong('MOMO_ACCESS_KEY', MOMO_MACDINH.accessKey),
    secretKey: layGiaTriMoiTruong('MOMO_SECRET_KEY', MOMO_MACDINH.secretKey)
  };
}

function stringifyMoMoValue(value) {
  if (value == null) return '';
  return String(value);
}
// Tạo chữ ký HMAC SHA256 cho yêu cầu MoMo
function taoSignature({ accessKey, amount, extraData, ipnUrl, orderId, orderInfo, partnerCode, redirectUrl, requestId, requestType }, secretKey) {
  const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
  return crypto.createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');
}

function taoChuoiChuKyKetQuaMoMo(payload = {}) {
  return [
    `accessKey=${stringifyMoMoValue(payload.accessKey)}`,
    `amount=${stringifyMoMoValue(payload.amount)}`,
    `extraData=${stringifyMoMoValue(payload.extraData)}`,
    `message=${stringifyMoMoValue(payload.message)}`,
    `orderId=${stringifyMoMoValue(payload.orderId)}`,
    `orderInfo=${stringifyMoMoValue(payload.orderInfo)}`,
    `orderType=${stringifyMoMoValue(payload.orderType)}`,
    `partnerCode=${stringifyMoMoValue(payload.partnerCode)}`,
    `payType=${stringifyMoMoValue(payload.payType)}`,
    `requestId=${stringifyMoMoValue(payload.requestId)}`,
    `responseTime=${stringifyMoMoValue(payload.responseTime)}`,
    `resultCode=${stringifyMoMoValue(payload.resultCode)}`,
    `transId=${stringifyMoMoValue(payload.transId)}`
  ].join('&');
}

function kiemTraChuKyKetQuaMoMo(payload = {}) {
  const { partnerCode, accessKey, secretKey } = layThongTinXacThucMoMo();
  const receivedSignature = String(payload.signature || '').trim().toLowerCase();

  if (!partnerCode || !accessKey || !secretKey) {
    return { valid: false, reason: 'missing_momo_credentials' };
  }

  if (!receivedSignature) {
    return { valid: false, reason: 'missing_signature' };
  }

  const normalizedPayload = {
    accessKey,
    amount: stringifyMoMoValue(payload.amount),
    extraData: stringifyMoMoValue(payload.extraData),
    message: stringifyMoMoValue(payload.message),
    orderId: stringifyMoMoValue(payload.orderId),
    orderInfo: stringifyMoMoValue(payload.orderInfo),
    orderType: stringifyMoMoValue(payload.orderType),
    partnerCode: stringifyMoMoValue(payload.partnerCode),
    payType: stringifyMoMoValue(payload.payType),
    requestId: stringifyMoMoValue(payload.requestId),
    responseTime: stringifyMoMoValue(payload.responseTime),
    resultCode: stringifyMoMoValue(payload.resultCode),
    transId: stringifyMoMoValue(payload.transId)
  };

  if (normalizedPayload.partnerCode !== partnerCode) {
    return { valid: false, reason: 'partner_code_mismatch' };
  }

  const rawSignature = taoChuoiChuKyKetQuaMoMo(normalizedPayload);
  const expectedSignature = crypto.createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');

  const receivedBuffer = Buffer.from(receivedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const valid = receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

  return {
    valid,
    reason: valid ? '' : 'signature_mismatch',
    expectedSignature,
    rawSignature
  };
}
// Gửi yêu cầu thanh toán đến MoMo
function guiYeuCauMoMo(requestBody) {
  const payload = JSON.stringify(requestBody);
//
  const options = {
    hostname: 'test-payment.momo.vn',
    port: 443,
    path: '/v2/gateway/api/create',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };
// Trả về một Promise để xử lý kết quả bất đồng bộ
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          resolve({ status: res.statusCode, data: json });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
// Gửi yêu cầu hoàn tiền đến MoMo
function guiYeuCauHoanTien(requestBody) {
  const payload = JSON.stringify(requestBody);

  const options = {
    hostname: 'test-payment.momo.vn',
    port: 443,
    path: '/v2/gateway/api/refund',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          resolve({ status: res.statusCode, data: json });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function guiYeuCauTruyVan(requestBody) {
  const payload = JSON.stringify(requestBody);

  const options = {
    hostname: 'test-payment.momo.vn',
    port: 443,
    path: '/v2/gateway/api/query',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          resolve({ status: res.statusCode, data: json });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function taoThanhToanMoMo({ orderId, requestId, amount, orderInfo, redirectUrl, ipnUrl, extraData = '' }) {
  const { partnerCode, accessKey, secretKey } = layThongTinXacThucMoMo();
  const requestType = String(process.env.MOMO_REQUEST_TYPE || 'captureWallet');
  const lang = String(process.env.MOMO_LANG || 'vi');

  const signature = taoSignature({
    accessKey,
    amount,
    extraData,
    ipnUrl,
    orderId,
    orderInfo,
    partnerCode,
    redirectUrl,
    requestId,
    requestType
  }, secretKey);

  const requestBody = {
    partnerCode,
    accessKey,
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature,
    lang
  };

  const { data } = await guiYeuCauMoMo(requestBody);
  return data;
}

async function taoHoanTienMoMo({ orderId, requestId, amount, transId, description = '' }) {
  const { partnerCode, accessKey, secretKey } = layThongTinXacThucMoMo();

  const rawSignature = `accessKey=${accessKey}&amount=${amount}&description=${description}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}&transId=${transId}`;
  const signature = crypto.createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');

  const requestBody = {
    partnerCode,
    accessKey,
    requestId,
    amount,
    orderId,
    transId,
    description,
    signature
  };

  const { data } = await guiYeuCauHoanTien(requestBody);
  return data;
}

async function truyVanGiaoDichMoMo({ orderId, requestId }) {
  const { partnerCode, accessKey, secretKey } = layThongTinXacThucMoMo();
  const lang = String(process.env.MOMO_LANG || 'vi');

  const rawSignature = `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`;
  const signature = crypto.createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');

  const requestBody = {
    partnerCode,
    accessKey,
    requestId,
    orderId,
    signature,
    lang
  };

  const { data } = await guiYeuCauTruyVan(requestBody);
  return data;
}

module.exports = {
  layThongTinXacThucMoMo,
  kiemTraChuKyKetQuaMoMo,
  taoThanhToanMoMo,
  taoHoanTienMoMo,
  truyVanGiaoDichMoMo
};

