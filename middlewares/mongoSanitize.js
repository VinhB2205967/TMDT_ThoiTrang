function laDoiTuongThuan(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function nenLoaiBoKhoa(key, { allowDots, allowDollars }) {
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') return true;
  if (!allowDollars && key.includes('$')) return true;
  if (!allowDots && key.includes('.')) return true;
  return false;
}

function lamSachTaiCho(target, options, daGap) {
  if (!target || typeof target !== 'object') return;
  if (daGap.has(target)) return;
  daGap.add(target);

  if (Array.isArray(target)) {
    for (const item of target) lamSachTaiCho(item, options, daGap);
    return;
  }

  if (!laDoiTuongThuan(target)) {
    // Don't touch class instances / special objects
    return;
  }

  const keys = Object.keys(target);
  for (const key of keys) {
    const value = target[key];

    if (nenLoaiBoKhoa(key, options)) {
      if (!options.dryRun) {
        delete target[key];
      }

      if (typeof options.onSanitize === 'function') {
        options.onSanitize({ key });
      }

      continue;
    }

    lamSachTaiCho(value, options, daGap);
  }
}


module.exports = function mongoSanitize(options = {}) {
  const tuyChonChuanHoa = {
    allowDots: false,
    allowDollars: false,
    dryRun: false,
    onSanitize: null,
    ...options
  };

  return function (req, res, next) {
    try {
      if (req.body) lamSachTaiCho(req.body, tuyChonChuanHoa, new WeakSet());
      if (req.params) lamSachTaiCho(req.params, tuyChonChuanHoa, new WeakSet());

      // req.query is a getter in Express 5; mutate returned object in-place.
      const query = req.query;
      if (query) lamSachTaiCho(query, tuyChonChuanHoa, new WeakSet());
    } catch (err) {
      // Fail-open to avoid taking down the app.
      if (process.env.NODE_ENV !== 'production') {
        console.error('mongoSanitize error:', err);
      }
    }

    next();
  };
};
