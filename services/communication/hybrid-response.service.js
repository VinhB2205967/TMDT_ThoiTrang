const { muonJSON } = require('../../helpers/http');

function laYeuCauApi(req) {
  const contentType = String(req.get('content-type') || '').toLowerCase();
  const path = String(req.path || '');
  return muonJSON(req) || path.startsWith('/api/') || contentType.includes('application/json');
}

function traJsonThanhCong(res, { status = 200, message, data = null }) {
  return res.status(status).json({
    success: true,
    message,
    data
  });
}

function traJsonThatBai(res, { status = 400, message, code, errors }) {
  return res.status(status).json({
    success: false,
    code,
    message,
    ...(errors ? { errors } : {})
  });
}

module.exports = {
  laYeuCauApi,
  traJsonThanhCong,
  traJsonThatBai
};
