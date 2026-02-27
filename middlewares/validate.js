const { validationResult } = require('express-validator');

function validateRequest(options = {}) {
  const {
    redirectTo = '/',
    errorMessage = 'Dữ liệu không hợp lệ',
    preserveFields = []
  } = options;

  return function (req, res, next) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const first = errors.array({ onlyFirstError: true })[0];
    const message = first?.msg || errorMessage;
    if (req.flash) req.flash('error', message);

    if (req.flash && Array.isArray(preserveFields) && preserveFields.length > 0) {
      const payload = {};
      preserveFields.forEach((field) => {
        payload[field] = req.body && req.body[field] !== undefined ? req.body[field] : '';
      });
      req.flash('formData', JSON.stringify(payload));
    }

    return res.redirect(req.get('Referrer') || redirectTo);
  };
}

module.exports = { validateRequest };