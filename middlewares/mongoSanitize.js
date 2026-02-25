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
    strict: false,
    onSanitize: null,
    ...options
  };

  return function (req, res, next) {
    let daSanitize = false;
    const onSanitize = ({ key }) => {
      daSanitize = true;
      if (typeof tuyChonChuanHoa.onSanitize === 'function') {
        tuyChonChuanHoa.onSanitize({ key });
      }
    };

    try {
      const opts = { ...tuyChonChuanHoa, onSanitize };

      if (req.body) lamSachTaiCho(req.body, opts, new WeakSet());
      if (req.params) lamSachTaiCho(req.params, opts, new WeakSet());

      // req.query is a getter in Express 5; mutate returned object in-place.
      const query = req.query;
      if (query) lamSachTaiCho(query, opts, new WeakSet());

      if (req.headers) lamSachTaiCho(req.headers, opts, new WeakSet());

      if (daSanitize && tuyChonChuanHoa.strict) {
        return res.status(400).json({
          success: false,
          message: 'Dữ liệu không hợp lệ'
        });
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('mongoSanitize error:', err);
      }

      if (tuyChonChuanHoa.strict || process.env.NODE_ENV === 'production') {
        return res.status(400).json({
          success: false,
          message: 'Dữ liệu không hợp lệ'
        });
      }
    }

    return next();
  };
};
