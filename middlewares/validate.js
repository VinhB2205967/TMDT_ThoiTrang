const { validationResult } = require('express-validator');

function validateRequest(options = {}) {
  const {
    redirectTo = '/',
    errorMessage = 'Dữ liệu không hợp lệ'
  } = options;

  return function (req, res, next) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const first = errors.array({ onlyFirstError: true })[0];
    const message = first?.msg || errorMessage;
    if (req.flash) req.flash('error', message);
    return res.redirect(req.get('Referrer') || redirectTo);
  };
}

module.exports = { validateRequest };