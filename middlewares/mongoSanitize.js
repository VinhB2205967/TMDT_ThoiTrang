function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shouldStripKey(key, { allowDots, allowDollars }) {
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') return true;
  if (!allowDollars && key.includes('$')) return true;
  if (!allowDots && key.includes('.')) return true;
  return false;
}

function sanitizeInPlace(target, options, seen) {
  if (!target || typeof target !== 'object') return;
  if (seen.has(target)) return;
  seen.add(target);

  if (Array.isArray(target)) {
    for (const item of target) sanitizeInPlace(item, options, seen);
    return;
  }

  if (!isPlainObject(target)) {
    // Don't touch class instances / special objects
    return;
  }

  const keys = Object.keys(target);
  for (const key of keys) {
    const value = target[key];

    if (shouldStripKey(key, options)) {
      if (!options.dryRun) {
        delete target[key];
      }

      if (typeof options.onSanitize === 'function') {
        options.onSanitize({ key });
      }

      continue;
    }

    sanitizeInPlace(value, options, seen);
  }
}

/**
 * Express middleware to mitigate MongoDB operator injection.
 *
 * Express 5 makes req.query read-only (getter), so we must sanitize in-place
 * and MUST NOT assign back to req.query.
 */
module.exports = function mongoSanitize(options = {}) {
  const normalizedOptions = {
    allowDots: false,
    allowDollars: false,
    dryRun: false,
    onSanitize: null,
    ...options
  };

  return function (req, res, next) {
    try {
      if (req.body) sanitizeInPlace(req.body, normalizedOptions, new WeakSet());
      if (req.params) sanitizeInPlace(req.params, normalizedOptions, new WeakSet());

      // req.query is a getter in Express 5; mutate returned object in-place.
      const query = req.query;
      if (query) sanitizeInPlace(query, normalizedOptions, new WeakSet());
    } catch (err) {
      // Fail-open to avoid taking down the app.
      if (process.env.NODE_ENV !== 'production') {
        console.error('mongoSanitize error:', err);
      }
    }

    next();
  };
};
