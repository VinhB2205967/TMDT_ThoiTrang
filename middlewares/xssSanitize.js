const xss = require('xss');

function laDoiTuongThuan(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function lamSachXss(target, daGap) {
  if (!target || typeof target !== 'object') return;
  if (daGap.has(target)) return;
  daGap.add(target);

  if (Array.isArray(target)) {
    for (const item of target) lamSachXss(item, daGap);
    return;
  }

  if (!laDoiTuongThuan(target)) return;

  const keys = Object.keys(target);
  for (const key of keys) {
    const value = target[key];
    if (typeof value === 'string') {
      target[key] = xss(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script'] });
      continue;
    }
    lamSachXss(value, daGap);
  }
}

module.exports = function xssSanitize() {
  return function (req, res, next) {
    try {
      if (req.body) lamSachXss(req.body, new WeakSet());
      if (req.params) lamSachXss(req.params, new WeakSet());
      const query = req.query;
      if (query) lamSachXss(query, new WeakSet());
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('xssSanitize error:', err);
      }
    }
    next();
  };
};
