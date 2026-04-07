const https = require('https');
const crypto = require('crypto');

const MOMO_MACDINH = {
  partnerCode: '',
  accessKey: '',
  secretKey: '',
  partnerName: 'Test',
  storeId: 'MomoTestStore'
};

const MOMO_HOSTNAME = String(process.env.MOMO_HOSTNAME || 'test-payment.momo.vn').trim();
const MOMO_TIMEOUT_MS = Math.max(30000, Number(process.env.MOMO_TIMEOUT_MS || 30000) || 30000);
// Lấy giá trị môi trường với tên biến và giá trị mặc định nếu không tồn tại
function layGiaTriMoiTruong(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function layThongTinXacThucMoMo() {
  return {
    partnerCode: layGiaTriMoiTruong('MOMO_PARTNER_CODE', MOMO_MACDINH.partnerCode),
    accessKey: layGiaTriMoiTruong('MOMO_ACCESS_KEY', MOMO_MACDINH.accessKey),
    secretKey: layGiaTriMoiTruong('MOMO_SECRET_KEY', MOMO_MACDINH.secretKey),
    partnerName: layGiaTriMoiTruong('MOMO_PARTNER_NAME', MOMO_MACDINH.partnerName),
    storeId: layGiaTriMoiTruong('MOMO_STORE_ID', MOMO_MACDINH.storeId)
  };
}

function stringifyMoMoValue(value) {
  if (value == null) return '';
  return String(value);
}

function toMoMoLong(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function normalizeMoMoRefundId(value, fallbackPrefix = 'RF') {
  const raw = String(value || '').trim().replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  if (raw) return raw.slice(0, 50);

  const now = Date.now().toString();
  return `${fallbackPrefix}${now}`.slice(0, 50);
}

function taoMaHoanTienMoMo(seed = '', prefix = 'RF') {
  const safePrefix = String(prefix || 'RF').replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 8) || 'RF';
  const compactSeed = String(seed || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const tail = compactSeed ? compactSeed.slice(-10) : '';
  const now = Date.now().toString();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${safePrefix}${now}${tail}${random}`.slice(0, 50);
}

function taoThongTinYeuCauHoanTienMoMo(seed = '') {
  return {
    orderId: taoMaHoanTienMoMo(seed, 'RF'),
    requestId: taoMaHoanTienMoMo(seed, 'RQ')
  };
}

function rutGonNoiDungPhanHoi(raw = '') {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function chuanHoaThongDiepHoanTienMoMo(data) {
  if (!data || typeof data !== 'object') return data;

  const resultCode = Number(data.resultCode);
  const rawMessage = String(data.message || '').trim();
  if (resultCode === 0 || !rawMessage) return data;

  if (rawMessage === 'Declined due to general reasons. Please contact MoMo for more details.') {
    return {
      ...data,
      gatewayMessage: rawMessage,
      message: `MoMo từ chối yêu cầu hoàn tiền (mã ${resultCode}). Vui lòng thử lại sau ít phút hoặc kiểm tra cấu hình tài khoản hoàn tiền trên MoMo sandbox.`
    };
  }

  return data;
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

  const options = {
    hostname: MOMO_HOSTNAME,
    port: 443,
    path: '/v2/gateway/api/create',
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'TMDT-ThoiTrang/1.0',
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
          resolve({
            status: res.statusCode,
            data: null,
            raw: data,
            contentType: String(res.headers['content-type'] || '')
          });
        }
      });
    });

    req.setTimeout(MOMO_TIMEOUT_MS, () => {
      req.destroy(new Error('MOMO_REQUEST_TIMEOUT'));
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
    hostname: MOMO_HOSTNAME,
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
          resolve({
            status: res.statusCode,
            data: null,
            raw: data,
            contentType: String(res.headers['content-type'] || '')
          });
        }
      });
    });

    req.setTimeout(MOMO_TIMEOUT_MS, () => {
      req.destroy(new Error('MOMO_REQUEST_TIMEOUT'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function guiYeuCauTruyVan(requestBody) {
  const payload = JSON.stringify(requestBody);

  const options = {
    hostname: MOMO_HOSTNAME,
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
          resolve({
            status: res.statusCode,
            data: null,
            raw: data,
            contentType: String(res.headers['content-type'] || '')
          });
        }
      });
    });

    req.setTimeout(MOMO_TIMEOUT_MS, () => {
      req.destroy(new Error('MOMO_REQUEST_TIMEOUT'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function taoThanhToanMoMo({ orderId, requestId, amount, orderInfo, redirectUrl, ipnUrl, extraData = '' }) {
  const { partnerCode, accessKey, secretKey, partnerName, storeId } = layThongTinXacThucMoMo();
  const requestType = String(process.env.MOMO_REQUEST_TYPE || 'payWithMethod');
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
    partnerName,
    storeId,
    accessKey,
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    autoCapture: true,
    signature,
    lang
  };

  let response;
  try {
    response = await guiYeuCauMoMo(requestBody);
  } catch (error) {
    if (error && error.message === 'MOMO_REQUEST_TIMEOUT') {
      return {
        resultCode: -1,
        message: 'MoMo đang phản hồi chậm. Vui lòng thử lại sau ít phút.'
      };
    }

    return {
      resultCode: -1,
      message: 'Không thể kết nối MoMo. Vui lòng thử lại sau.'
    };
  }

  const { data, raw, status, contentType } = response;
  if (!data || typeof data !== 'object') {
    const snippet = rutGonNoiDungPhanHoi(raw);
    console.error('[MoMo] Non-JSON response', {
      status: status || 0,
      contentType: contentType || '',
      snippet
    });

    const statusText = status ? ` (HTTP ${status})` : '';
    return {
      resultCode: -1,
      message: `MoMo tạm thời không phản hồi hợp lệ${statusText}. Vui lòng thử lại sau.`
    };
  }

  if (Number(status) >= 500) {
    return {
      resultCode: -1,
      message: `MoMo đang bảo trì hoặc quá tải (HTTP ${status}). Vui lòng thử lại sau.`
    };
  }

  return data;
}

async function taoHoanTienMoMo({ orderId, requestId, amount, transId, description = '' }) {
  const { partnerCode, accessKey, secretKey } = layThongTinXacThucMoMo();
  const lang = String(process.env.MOMO_LANG || 'vi');
  const normalizedOrderId = normalizeMoMoRefundId(orderId, 'RF');
  const normalizedRequestId = normalizeMoMoRefundId(requestId, 'RQ');
  const normalizedAmount = toMoMoLong(amount, 0);
  const normalizedTransId = toMoMoLong(transId, 0);
  const normalizedDescription = String(description || '').trim().slice(0, 255);

  const rawSignature = `accessKey=${accessKey}&amount=${normalizedAmount}&description=${normalizedDescription}&orderId=${normalizedOrderId}&partnerCode=${partnerCode}&requestId=${normalizedRequestId}&transId=${normalizedTransId}`;
  const signature = crypto.createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');

  const requestBody = {
    partnerCode,
    accessKey,
    requestId: normalizedRequestId,
    amount: normalizedAmount,
    orderId: normalizedOrderId,
    transId: normalizedTransId,
    description: normalizedDescription,
    lang,
    signature
  };

  let response;
  try {
    response = await guiYeuCauHoanTien(requestBody);
  } catch (error) {
    if (error && error.message === 'MOMO_REQUEST_TIMEOUT') {
      return {
        resultCode: -1,
        message: 'MoMo đang phản hồi chậm. Vui lòng thử lại sau ít phút.'
      };
    }

    return {
      resultCode: -1,
      message: 'Không thể kết nối MoMo khi hoàn tiền. Vui lòng thử lại sau.'
    };
  }

  const { data, raw, status, contentType } = response;
  if (!data || typeof data !== 'object') {
    const snippet = rutGonNoiDungPhanHoi(raw);
    console.error('[MoMo] Refund non-JSON response', {
      status: status || 0,
      contentType: contentType || '',
      snippet
    });

    return {
      resultCode: -1,
      message: `MoMo hoàn tiền phản hồi không hợp lệ${status ? ` (HTTP ${status})` : ''}. Vui lòng thử lại sau.`
    };
  }

  if (Number(status) >= 500) {
    return {
      resultCode: -1,
      message: `MoMo hoàn tiền đang bảo trì hoặc quá tải (HTTP ${status}). Vui lòng thử lại sau.`
    };
  }

  return chuanHoaThongDiepHoanTienMoMo(data);
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

  let response;
  try {
    response = await guiYeuCauTruyVan(requestBody);
  } catch (error) {
    if (error && error.message === 'MOMO_REQUEST_TIMEOUT') {
      return {
        resultCode: -1,
        message: 'MoMo đang phản hồi chậm. Vui lòng thử lại sau ít phút.'
      };
    }

    return {
      resultCode: -1,
      message: 'Không thể kết nối MoMo khi truy vấn giao dịch. Vui lòng thử lại sau.'
    };
  }

  const { data, raw, status, contentType } = response;
  if (!data || typeof data !== 'object') {
    const snippet = rutGonNoiDungPhanHoi(raw);
    console.error('[MoMo] Query non-JSON response', {
      status: status || 0,
      contentType: contentType || '',
      snippet
    });

    return {
      resultCode: -1,
      message: `MoMo truy vấn phản hồi không hợp lệ${status ? ` (HTTP ${status})` : ''}. Vui lòng thử lại sau.`
    };
  }

  if (Number(status) >= 500) {
    return {
      resultCode: -1,
      message: `MoMo truy vấn đang bảo trì hoặc quá tải (HTTP ${status}). Vui lòng thử lại sau.`
    };
  }

  return data;
}

module.exports = {
  layThongTinXacThucMoMo,
  kiemTraChuKyKetQuaMoMo,
  taoThanhToanMoMo,
  taoHoanTienMoMo,
  taoThongTinYeuCauHoanTienMoMo,
  truyVanGiaoDichMoMo
};

