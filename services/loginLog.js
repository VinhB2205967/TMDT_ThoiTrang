const LoginLog = require('../models/login_log_model');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || '';
}

async function writeLoginLog({ req, user, email, provider, status, message }) {
  try {
    await LoginLog.create({
      userId: user?._id,
      email: email || user?.email,
      role: user?.vaitro || 'user',
      provider: provider || 'local',
      status: status || 'success',
      ip: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
      message: message || ''
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[loginLog] write error:', err);
    }
  }
}

module.exports = {
  writeLoginLog
};
