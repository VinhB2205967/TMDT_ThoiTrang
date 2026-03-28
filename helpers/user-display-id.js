const crypto = require('crypto');

function taoIdHienThiNguoiDung({ userId, createdAt } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return '';

  const created = createdAt ? new Date(createdAt) : null;
  const hopLeNgay = Boolean(created) && !Number.isNaN(created.getTime());
  const ngay = hopLeNgay
    ? `${String(created.getFullYear()).slice(-2)}${String(created.getMonth() + 1).padStart(2, '0')}${String(created.getDate()).padStart(2, '0')}`
    : '000000';

  const maRutGon = crypto
    .createHash('sha1')
    .update(uid)
    .digest('base64url')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  return `ND-${ngay}-${maRutGon || 'UNKNOWN'}`;
}

function laIdHienThiNguoiDung(value) {
  return /^ND-\d{6}-[A-Z0-9]{8}$/.test(String(value || '').trim());
}

function chuanIdNhanVienHienThi({ rawId, createdAt } = {}) {
  const text = String(rawId || '').trim();
  if (!text) return '';
  if (laIdHienThiNguoiDung(text)) return text;
  if (/^[a-fA-F0-9]{24}$/.test(text)) {
    return taoIdHienThiNguoiDung({ userId: text, createdAt });
  }
  return text;
}

module.exports = {
  taoIdHienThiNguoiDung,
  laIdHienThiNguoiDung,
  chuanIdNhanVienHienThi
};
