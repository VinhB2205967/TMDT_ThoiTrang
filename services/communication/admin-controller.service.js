const { redirectBackOrDefault } = require('./redirect.service');

function layAdminBase(req) {
  return req?.app?.locals?.admin || '/admin';
}

function chuanHoaSubPath(subPath = '') {
  return String(subPath || '').replace(/^\//, '');
}

function taoDuongDanAdmin(req, section, subPath = '') {
  const base = String(layAdminBase(req)).replace(/\/$/, '');
  const sec = String(section || '').replace(/^\//, '').replace(/\/$/, '');
  const tail = chuanHoaSubPath(subPath);
  const root = sec ? `${base}/${sec}` : base;
  return tail ? `${root}/${tail}` : root;
}

function redirectVe(req, res, fallback) {
  return redirectBackOrDefault(req, res, fallback);
}

function flashKetQua(req, result, resolveFlashType) {
  if (!req?.flash || !result?.message) return;
  const type = typeof resolveFlashType === 'function' ? resolveFlashType(result) : (result?.ok ? 'success' : 'error');
  req.flash(type, result.message);
}

function xuLyKetQuaSSR(req, res, result, { successPath, errorPath, resolveFlashType }) {
  flashKetQua(req, result, resolveFlashType);
  const fallback = result?.ok ? successPath : (errorPath || successPath);
  return redirectVe(req, res, fallback);
}

function taoDuongDanChiTietDon(req, id) {
  const base = layAdminBase(req);
  return `${base}/orders/${id}`;
}

module.exports = {
  layAdminBase,
  taoDuongDanAdmin,
  redirectVe,
  flashKetQua,
  xuLyKetQuaSSR,
  taoDuongDanChiTietDon
};
